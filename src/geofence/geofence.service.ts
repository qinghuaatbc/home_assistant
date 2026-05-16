import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ZoneEntity } from './zone.entity'
import { DeviceLocationEntity } from './device-location.entity'
import { PushService } from '../push/push.service'
import { StateMachineService } from '../core/state-machine/state-machine.service'
import { ContextService } from '../core/context/context.service'

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

@Injectable()
export class GeofenceService {
  private readonly logger = new Logger(GeofenceService.name)

  constructor(
    @InjectRepository(ZoneEntity)
    private readonly zoneRepo: Repository<ZoneEntity>,
    @InjectRepository(DeviceLocationEntity)
    private readonly locRepo: Repository<DeviceLocationEntity>,
    private readonly push: PushService,
    private readonly stateMachine: StateMachineService,
    private readonly contextService: ContextService,
  ) {}

  // ─── Zones ────────────────────────────────────────────────────────────────

  async getZones(): Promise<ZoneEntity[]> {
    return this.zoneRepo.find()
  }

  async createZone(name: string, lat: number, lon: number, radius: number, icon?: string): Promise<ZoneEntity> {
    const z = this.zoneRepo.create({ name, latitude: lat, longitude: lon, radiusMeters: radius, icon: icon ?? '📍' })
    const saved = await this.zoneRepo.save(z)
    this.logger.log(`Zone created: ${name} (${lat}, ${lon}) r=${radius}m`)
    return saved
  }

  async updateZone(id: number, data: Partial<ZoneEntity>): Promise<ZoneEntity | null> {
    await this.zoneRepo.update(id, data)
    return this.zoneRepo.findOne({ where: { id } })
  }

  async deleteZone(id: number): Promise<void> {
    await this.zoneRepo.delete(id)
  }

  // ─── Location updates ────────────────────────────────────────────────────

  async updateLocation(deviceId: string, lat: number, lon: number, accuracy: number, displayName?: string): Promise<{
    zoneId: number | null
    zoneName: string | null
    entered: string | null
    left: string | null
  }> {
    const zones = await this.zoneRepo.find()
    let matchedZone: ZoneEntity | null = null
    for (const zone of zones) {
      const dist = haversineMeters(lat, lon, zone.latitude, zone.longitude)
      if (dist <= zone.radiusMeters) { matchedZone = zone; break }
    }
    const newZoneId = matchedZone?.id ?? null

    const prev = await this.locRepo.findOne({ where: { deviceId } })
    const prevZoneId = prev?.zoneId ?? null

    await this.locRepo.upsert(
      { deviceId, latitude: lat, longitude: lon, accuracy, zoneId: newZoneId, displayName: displayName ?? deviceId },
      { conflictPaths: ['deviceId'] },
    )

    let entered: string | null = null
    let left: string | null = null

    if (newZoneId !== prevZoneId) {
      if (matchedZone) {
        entered = matchedZone.name
        this.logger.log(`${displayName ?? deviceId} entered zone: ${matchedZone.name}`)
        await this.push.sendToAll('📍 Zone Entered', `${displayName ?? deviceId} arrived at ${matchedZone.name}`)
        this.updateZoneState(matchedZone.name, 'home')
      }
      if (prevZoneId) {
        const prevZone = await this.zoneRepo.findOne({ where: { id: prevZoneId } })
        if (prevZone) {
          left = prevZone.name
          this.logger.log(`${displayName ?? deviceId} left zone: ${prevZone.name}`)
          await this.push.sendToAll('📍 Zone Left', `${displayName ?? deviceId} left ${prevZone.name}`)
          this.updateZoneState(prevZone.name, 'not_home')
        }
      }
    }

    return { zoneId: newZoneId, zoneName: matchedZone?.name ?? null, entered, left }
  }

  private updateZoneState(zoneName: string, state: string) {
    const entityId = `zone.${zoneName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
    try {
      this.stateMachine.setState(entityId, state, { friendly_name: zoneName }, this.contextService.system())
    } catch {}
  }

  async getDeviceLocations(): Promise<(DeviceLocationEntity & { zoneName?: string })[]> {
    const locs = await this.locRepo.find()
    const zones = await this.zoneRepo.find()
    const zoneMap = new Map(zones.map(z => [z.id, z.name]))
    return locs.map(l => ({ ...l, zoneName: l.zoneId != null ? zoneMap.get(l.zoneId) : undefined }))
  }
}
