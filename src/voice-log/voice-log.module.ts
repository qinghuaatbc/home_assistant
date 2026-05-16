import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { VoiceLogEntity } from './voice-log.entity'
import { VoiceLogService } from './voice-log.service'

@Module({
  imports: [TypeOrmModule.forFeature([VoiceLogEntity])],
  providers: [VoiceLogService],
  exports: [VoiceLogService],
})
export class VoiceLogModule {}
