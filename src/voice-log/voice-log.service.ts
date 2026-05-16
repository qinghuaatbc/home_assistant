import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { VoiceLogEntity } from './voice-log.entity'

@Injectable()
export class VoiceLogService {
  constructor(
    @InjectRepository(VoiceLogEntity)
    private readonly repo: Repository<VoiceLogEntity>,
  ) {}

  async log(transcript: string, response: string, lang: string, action?: object): Promise<void> {
    await this.repo.save(
      this.repo.create({
        transcript,
        response,
        lang,
        action: action ? JSON.stringify(action) : null,
      }),
    ).catch(() => {})
  }

  async getHistory(limit = 100): Promise<VoiceLogEntity[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: limit })
  }
}
