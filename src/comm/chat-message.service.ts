import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatMessageEntity } from './chat-message.entity'

@Injectable()
export class ChatMessageService {
  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly repo: Repository<ChatMessageEntity>,
  ) {}

  async save(msg: Omit<ChatMessageEntity, 'id'>): Promise<ChatMessageEntity> {
    return this.repo.save(this.repo.create(msg))
  }

  async getHistory(limit = 100): Promise<ChatMessageEntity[]> {
    return this.repo.find({
      order: { timestamp: 'DESC' },
      take: limit,
    }).then(rows => rows.reverse())
  }
}
