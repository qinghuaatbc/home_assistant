import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { StateMachineService } from '../core/state-machine/state-machine.service'
import { PushService } from '../push/push.service'

const POWER_HISTORY_SIZE = 12        // ~12 min of readings at 1-min interval
const POWER_SPIKE_FACTOR = 3         // alert if current > 3× baseline
const POWER_BASELINE_MIN_W = 10      // ignore sensors reporting < 10 W baseline
const DOOR_OPEN_THRESHOLD_MS = 30 * 60 * 1000  // 30 minutes

@Injectable()
export class AnomalyService implements OnModuleInit {
  private readonly logger = new Logger(AnomalyService.name)

  // Rolling power history: entity_id → [{value (W), time}]
  private readonly powerHistory = new Map<string, { value: number; time: number }[]>()

  // Track when doors/windows were opened
  private readonly doorOpenedAt = new Map<string, number>()

  // Debounce: don't re-alert the same entity until condition clears
  private readonly alertedPower = new Set<string>()
  private readonly alertedDoor = new Set<string>()

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    // Small delay so state machine finishes restoring from DB first
    setTimeout(() => {
      this.tick()
      setInterval(() => this.tick(), 60_000)
    }, 15_000)
    this.logger.log('Anomaly detection started (power spikes + door left open)')
  }

  private tick() {
    try {
      this.checkPower()
      this.checkDoors()
    } catch (err: any) {
      this.logger.error(`Anomaly tick error: ${err.message}`)
    }
  }

  private checkPower() {
    const states = this.stateMachine.getStates()
    for (const s of states) {
      const [domain] = s.entity_id.split('.')
      if (domain !== 'sensor') continue
      const unit = s.attributes?.unit_of_measurement as string | undefined
      if (!unit || !['W', 'kW'].includes(unit)) continue

      const raw = Number(s.state)
      if (isNaN(raw) || raw < 0) continue
      const watts = unit === 'kW' ? raw * 1000 : raw

      const history = this.powerHistory.get(s.entity_id) ?? []
      history.push({ value: watts, time: Date.now() })
      while (history.length > POWER_HISTORY_SIZE) history.shift()
      this.powerHistory.set(s.entity_id, history)

      if (history.length < 5) continue   // need enough baseline readings

      const baseline = history.slice(0, -1)
      const avg = baseline.reduce((sum, p) => sum + p.value, 0) / baseline.length

      if (avg >= POWER_BASELINE_MIN_W && watts > avg * POWER_SPIKE_FACTOR) {
        if (!this.alertedPower.has(s.entity_id)) {
          this.alertedPower.add(s.entity_id)
          const name = String(s.attributes?.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
          const msg = `${name}: ${watts >= 1000 ? (watts / 1000).toFixed(1) + ' kW' : watts.toFixed(0) + ' W'} (normal ~${avg >= 1000 ? (avg / 1000).toFixed(1) + ' kW' : avg.toFixed(0) + ' W'})`
          this.logger.warn(`Power spike detected: ${msg}`)
          this.push.sendToAll('⚡ Power Spike', msg).catch(() => {})
        }
      } else {
        this.alertedPower.delete(s.entity_id)
      }
    }
  }

  private checkDoors() {
    const states = this.stateMachine.getStates()
    const now = Date.now()

    for (const s of states) {
      const [domain] = s.entity_id.split('.')
      if (domain !== 'binary_sensor') continue
      const dc = s.attributes?.device_class as string | undefined
      if (!dc || !['door', 'window', 'garage_door'].includes(dc)) continue

      if (s.state === 'on') {
        if (!this.doorOpenedAt.has(s.entity_id)) {
          this.doorOpenedAt.set(s.entity_id, now)
        }
        const openedAt = this.doorOpenedAt.get(s.entity_id)!
        const openMs = now - openedAt

        if (openMs >= DOOR_OPEN_THRESHOLD_MS && !this.alertedDoor.has(s.entity_id)) {
          this.alertedDoor.add(s.entity_id)
          const name = String(s.attributes?.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
          const minutes = Math.round(openMs / 60000)
          const icon = dc === 'window' ? '🪟' : dc === 'garage_door' ? '🚗' : '🚪'
          this.logger.warn(`Door left open: ${name} (${minutes} min)`)
          this.push.sendToAll(`${icon} Left Open`, `${name} has been open for ${minutes} minutes`).catch(() => {})
        }
      } else {
        this.doorOpenedAt.delete(s.entity_id)
        this.alertedDoor.delete(s.entity_id)
      }
    }
  }
}
