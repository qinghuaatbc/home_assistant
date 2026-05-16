import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

export interface NotificationRule {
  id: string
  entity_id: string
  state: string
  title: string
  body: string
  enabled: boolean
}

const RULES_FILE = path.resolve(process.cwd(), 'config', 'notification-rules.json')

@Injectable()
export class NotificationRulesService {
  private readonly logger = new Logger(NotificationRulesService.name)
  private rules: NotificationRule[] = []

  constructor() { this.load() }

  private load() {
    try {
      if (fs.existsSync(RULES_FILE)) {
        this.rules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'))
      }
    } catch { this.rules = [] }
  }

  private save() {
    fs.mkdirSync(path.dirname(RULES_FILE), { recursive: true })
    fs.writeFileSync(RULES_FILE, JSON.stringify(this.rules, null, 2))
  }

  getAll(): NotificationRule[] { return this.rules }

  create(dto: Omit<NotificationRule, 'id'>): NotificationRule {
    const rule = { ...dto, id: uuidv4() }
    this.rules.push(rule)
    this.save()
    return rule
  }

  update(id: string, dto: Partial<NotificationRule>): NotificationRule | null {
    const idx = this.rules.findIndex(r => r.id === id)
    if (idx === -1) return null
    this.rules[idx] = { ...this.rules[idx], ...dto }
    this.save()
    return this.rules[idx]
  }

  delete(id: string): boolean {
    const before = this.rules.length
    this.rules = this.rules.filter(r => r.id !== id)
    if (this.rules.length !== before) { this.save(); return true }
    return false
  }

  match(entity_id: string, state: string): NotificationRule[] {
    return this.rules.filter(r => r.enabled && r.entity_id === entity_id && r.state === state)
  }
}
