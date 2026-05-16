import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ThermostatScheduleEntity } from './thermostat-schedule.entity'
import { ServiceRegistryService } from '../core/service-registry/service-registry.service'
import { ContextService } from '../core/context/context.service'

export interface ScheduleEntry {
  dayOfWeek: number
  hour: number
  temperature: number
  enabled: boolean
}

@Injectable()
export class ThermostatScheduleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ThermostatScheduleService.name)
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    @InjectRepository(ThermostatScheduleEntity)
    private readonly repo: Repository<ThermostatScheduleEntity>,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly contextService: ContextService,
  ) {}

  onModuleInit() {
    // Check on startup and then every 5 minutes
    this.applyCurrentSlot()
    this.timer = setInterval(() => this.applyCurrentSlot(), 5 * 60 * 1000)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async getSchedule(entityId: string): Promise<ScheduleEntry[]> {
    const rows = await this.repo.find({ where: { entityId } })
    return rows.map(r => ({
      dayOfWeek: r.dayOfWeek,
      hour: r.hour,
      temperature: r.temperature,
      enabled: r.enabled === 1,
    }))
  }

  async saveSchedule(entityId: string, entries: ScheduleEntry[]): Promise<void> {
    await this.repo.delete({ entityId })
    if (entries.length === 0) return
    const rows = entries.map(e =>
      this.repo.create({
        entityId,
        dayOfWeek: e.dayOfWeek,
        hour: e.hour,
        temperature: e.temperature,
        enabled: e.enabled ? 1 : 0,
      })
    )
    await this.repo.save(rows)
    this.logger.log(`Saved ${rows.length} schedule entries for ${entityId}`)
  }

  async listEntities(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('s')
      .select('DISTINCT s.entityId', 'entityId')
      .getRawMany()
    return rows.map((r: any) => r.entityId)
  }

  async applyCurrentSlot(): Promise<void> {
    const now = new Date()
    // JS getDay(): 0=Sun..6=Sat → convert to 0=Mon..6=Sun
    const jsDay = now.getDay()
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1
    const hour = now.getHours()

    const slots = await this.repo.find({ where: { dayOfWeek, hour, enabled: 1 } })
    for (const slot of slots) {
      try {
        await this.serviceRegistry.call({
          domain: 'climate',
          service: 'set_temperature',
          service_data: { temperature: slot.temperature },
          target: { entity_id: slot.entityId },
          context: this.contextService.system(),
        })
        this.logger.log(`Thermostat schedule: set ${slot.entityId} → ${slot.temperature}° (day=${dayOfWeek} hour=${hour})`)
      } catch (err: any) {
        this.logger.warn(`Failed to apply schedule for ${slot.entityId}: ${err.message}`)
      }
    }
  }
}
