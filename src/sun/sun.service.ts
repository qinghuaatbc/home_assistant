import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { StateMachineService } from '../core/state-machine/state-machine.service'
import { ContextService } from '../core/context/context.service'
import { PushService } from '../push/push.service'

export interface SunTimes {
  rise: Date
  set: Date
  nextRise: Date
  nextSet: Date
  elevation: number
  isAboveHorizon: boolean
}

// NOAA solar calculator (accurate to within 1 minute)
function calcSunTimes(lat: number, lon: number, date: Date): { rise: Date; set: Date } | null {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(Date.UTC(date.getUTCFullYear(), 0, 0)).getTime()) / 86400000,
  )
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (date.getUTCHours() - 12) / 24)

  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.04089 * Math.sin(2 * gamma))

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)

  const latR = (lat * Math.PI) / 180
  const cosHA =
    (Math.cos((90.833 * Math.PI) / 180) - Math.sin(latR) * Math.sin(decl)) /
    (Math.cos(latR) * Math.cos(decl))

  if (cosHA < -1 || cosHA > 1) return null // polar day/night

  const HA = (Math.acos(cosHA) * 180) / Math.PI

  const riseMin = 720 - 4 * (lon + HA) - eqtime
  const setMin = 720 - 4 * (lon - HA) - eqtime

  const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return {
    rise: new Date(base + riseMin * 60000),
    set: new Date(base + setMin * 60000),
  }
}

function solarElevation(lat: number, lon: number, date: Date): number {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(Date.UTC(date.getUTCFullYear(), 0, 0)).getTime()) / 86400000,
  )
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (date.getUTCHours() - 12) / 24)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma)
  const eqtime =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.04089 * Math.sin(2 * gamma))
  const timeOffset = eqtime + 4 * lon
  const tst = (date.getUTCHours() * 60 + date.getUTCMinutes()) + timeOffset
  const ha = ((tst / 4) - 180) * (Math.PI / 180)
  const latR = (lat * Math.PI) / 180
  const sinEl = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha)
  return (Math.asin(sinEl) * 180) / Math.PI
}

@Injectable()
export class SunService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SunService.name)
  private timer: ReturnType<typeof setInterval> | null = null
  private lastFiredMinute = -1

  constructor(
    private readonly config: ConfigService,
    private readonly stateMachine: StateMachineService,
    private readonly contextService: ContextService,
    private readonly push: PushService,
  ) {}

  private get lat(): number { return Number(this.config.get('homeassistant.latitude', 0)) }
  private get lon(): number { return Number(this.config.get('homeassistant.longitude', 0)) }

  onModuleInit() {
    this.updateSunEntity()
    this.timer = setInterval(() => this.tick(), 60_000)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private tick() {
    const now = new Date()
    const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes()
    if (minuteOfDay === this.lastFiredMinute) return
    this.lastFiredMinute = minuteOfDay

    this.updateSunEntity()

    const times = calcSunTimes(this.lat, this.lon, now)
    if (!times) return

    const riseMod = times.rise.getUTCHours() * 60 + times.rise.getUTCMinutes()
    const setMod = times.set.getUTCHours() * 60 + times.set.getUTCMinutes()

    if (Math.abs(minuteOfDay - riseMod) <= 1) {
      this.logger.log('🌅 Sunrise event fired')
      this.push.sendToAll('🌅 Sunrise', `Good morning! Sun rose at ${times.rise.toLocaleTimeString()}`)
    }
    if (Math.abs(minuteOfDay - setMod) <= 1) {
      this.logger.log('🌇 Sunset event fired')
      this.push.sendToAll('🌇 Sunset', `Sun has set. Good evening!`)
    }
  }

  private updateSunEntity() {
    const now = new Date()
    const elev = solarElevation(this.lat, this.lon, now)
    const above = elev > -0.833
    const times = calcSunTimes(this.lat, this.lon, now)

    const tomorrow = new Date(now)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    const nextTimes = calcSunTimes(this.lat, this.lon, tomorrow)

    this.stateMachine.setState(
      'sun.sun',
      above ? 'above_horizon' : 'below_horizon',
      {
        friendly_name: 'Sun',
        elevation: Math.round(elev * 10) / 10,
        azimuth: 0,
        next_rising: times && !above ? times.rise.toISOString() : nextTimes?.rise.toISOString() ?? null,
        next_setting: times && above ? times.set.toISOString() : nextTimes?.set.toISOString() ?? null,
      },
      this.contextService.system(),
    )
  }

  getSunTimes(date = new Date()): SunTimes | null {
    const times = calcSunTimes(this.lat, this.lon, date)
    if (!times) return null

    const tomorrow = new Date(date)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    const nextTimes = calcSunTimes(this.lat, this.lon, tomorrow)

    const elev = solarElevation(this.lat, this.lon, date)

    return {
      rise: times.rise,
      set: times.set,
      nextRise: nextTimes?.rise ?? times.rise,
      nextSet: nextTimes?.set ?? times.set,
      elevation: Math.round(elev * 10) / 10,
      isAboveHorizon: elev > -0.833,
    }
  }

  getLocation() {
    return { latitude: this.lat, longitude: this.lon }
  }
}
