import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as webpush from 'web-push'
import * as fs from 'fs'
import * as path from 'path'
import { PushSubscriptionEntity } from './push-subscription.entity'
import { NotificationRulesService } from './notification-rules.service'
import { EventBusService } from '../core/event-bus/event-bus.service'
import { EVENT_STATE_CHANGED } from '../common/constants/events.constants'

const VAPID_FILE = path.resolve(process.cwd(), 'config', 'vapid-keys.json')

interface VapidKeys { publicKey: string; privateKey: string }
interface StateChangedData {
  entity_id: string
  new_state: { state: string; attributes: Record<string, unknown> } | null
  old_state: { state: string; attributes: Record<string, unknown> } | null
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name)
  private vapidKeys: VapidKeys | null = null

  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private readonly repo: Repository<PushSubscriptionEntity>,
    private readonly eventBus: EventBusService,
    private readonly rules: NotificationRulesService,
  ) {}

  onModuleInit() {
    this.loadOrGenerateVapidKeys()
    this.watchStateChanges()
  }

  private loadOrGenerateVapidKeys() {
    try {
      if (fs.existsSync(VAPID_FILE)) {
        this.vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'))
      } else {
        const keys = webpush.generateVAPIDKeys()
        fs.mkdirSync(path.dirname(VAPID_FILE), { recursive: true })
        fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2))
        this.vapidKeys = keys
        this.logger.log('Generated new VAPID keys')
      }
      webpush.setVapidDetails(
        'https://6759.ddns.net',
        this.vapidKeys!.publicKey,
        this.vapidKeys!.privateKey,
      )
      this.logger.log('VAPID keys loaded')
    } catch (err) {
      this.logger.error('Failed to load/generate VAPID keys', err)
    }
  }

  getPublicKey(): string {
    return this.vapidKeys?.publicKey ?? ''
  }

  async subscribe(endpoint: string, p256dh: string, auth: string, label?: string): Promise<void> {
    await this.repo.upsert(
      { endpoint, p256dh, auth, label: label ?? null },
      { conflictPaths: ['endpoint'] },
    )
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.repo.delete({ endpoint })
  }

  async sendToAll(title: string, body: string, icon = '/favicon.ico'): Promise<void> {
    const subs = await this.repo.find()
    const payload = JSON.stringify({ title, body, icon })
    const dead: string[] = []

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint)
        else this.logger.warn(`Push failed [${err.statusCode ?? '?'}] ${sub.endpoint.slice(0, 40)}: ${err.message} ${err.body ?? ''}`)
      }
    }))

    if (dead.length) {
      await this.repo.delete(dead.map(endpoint => ({ endpoint })))
      this.logger.log(`Removed ${dead.length} expired subscription(s)`)
    }
  }

  private watchStateChanges() {
    this.eventBus.listen<StateChangedData>(EVENT_STATE_CHANGED, async (event) => {
      const { entity_id, new_state, old_state } = event.data
      if (!new_state || !old_state) return
      if (new_state.state === old_state.state) return

      const name = String(new_state.attributes.friendly_name ?? entity_id.split('.')[1])
      const domain = entity_id.split('.')[0]
      const dc = String(new_state.attributes.device_class ?? '')

      // Custom rules (user-configured)
      const matched = this.rules.match(entity_id, new_state.state)
      for (const rule of matched) {
        await this.sendToAll(rule.title, rule.body)
      }

      // Built-in rules (defaults, skipped if a custom rule already matched this entity+state)
      if (matched.length === 0) {
        if (domain === 'binary_sensor') {
          if ((dc === 'door' || dc === 'window') && new_state.state === 'on')
            await this.sendToAll('🚪 ' + name, `${name} opened`)
          else if (dc === 'motion' && new_state.state === 'on')
            await this.sendToAll('🏃 Motion', `${name} detected`)
          else if (dc === 'smoke' && new_state.state === 'on')
            await this.sendToAll('🚨 SMOKE ALARM', name)
        }
        if (domain === 'alarm_control_panel') {
          if (new_state.state === 'triggered')
            await this.sendToAll('🚨 ALARM TRIGGERED', name)
          else if (new_state.state === 'disarmed')
            await this.sendToAll('✅ Alarm Disarmed', name)
          else if (new_state.state === 'armed_away')
            await this.sendToAll('🔒 Armed Away', name)
        }
        if (domain === 'lock' && new_state.state === 'unlocked')
          await this.sendToAll('🔓 Lock Opened', name)
        if (domain === 'cover') {
          if (new_state.state === 'open')
            await this.sendToAll('🚗 ' + name, `${name} opened`)
          else if (new_state.state === 'closed')
            await this.sendToAll('✅ ' + name, `${name} closed`)
        }
      }
    })
  }
}
