import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { VoiceMessageEntity } from './voice-message.entity'
import * as fs from 'fs'
import * as path from 'path'

const VOICE_DIR = path.resolve(process.cwd(), 'config', 'voice_messages')

@Injectable()
export class VoiceMessageService {
  private readonly logger = new Logger(VoiceMessageService.name)

  constructor(
    @InjectRepository(VoiceMessageEntity)
    private readonly repo: Repository<VoiceMessageEntity>,
  ) {
    fs.mkdirSync(VOICE_DIR, { recursive: true })
  }

  async save(
    senderId: string,
    senderName: string,
    recipientId: string | null,
    buffer: Buffer,
    ext: string,
    durationMs: number,
  ): Promise<VoiceMessageEntity> {
    const filename = `vm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
    fs.writeFileSync(path.join(VOICE_DIR, filename), buffer)
    return this.repo.save(this.repo.create({ senderId, senderName, recipientId, filename, durationMs }))
  }

  getFilePath(filename: string): string {
    return path.join(VOICE_DIR, filename)
  }

  async findById(id: number): Promise<VoiceMessageEntity | null> {
    return this.repo.findOne({ where: { id } })
  }

  async getPending(recipientId: string): Promise<VoiceMessageEntity[]> {
    return this.repo.find({
      where: [
        { recipientId, delivered: 0 },
        { recipientId: null as any, delivered: 0 },
      ],
      order: { createdAt: 'ASC' },
    })
  }

  async markDelivered(id: number): Promise<void> {
    await this.repo.update(id, { delivered: 1 })
  }

  async getHistory(limit = 50): Promise<VoiceMessageEntity[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: limit })
  }
}
