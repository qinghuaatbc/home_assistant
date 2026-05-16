import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommGateway } from './comm.gateway';
import { VoiceMessageEntity } from './voice-message.entity';
import { VoiceMessageService } from './voice-message.service';
import { VoiceMessageController } from './voice-message.controller';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule, TypeOrmModule.forFeature([VoiceMessageEntity])],
  providers: [CommGateway, VoiceMessageService],
  controllers: [VoiceMessageController],
})
export class CommModule {}
