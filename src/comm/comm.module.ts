import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommGateway } from './comm.gateway';
import { VoiceMessageEntity } from './voice-message.entity';
import { VoiceMessageService } from './voice-message.service';
import { VoiceMessageController } from './voice-message.controller';
import { ChatMessageEntity } from './chat-message.entity';
import { ChatMessageService } from './chat-message.service';
import { ChatMessageController } from './chat-message.controller';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule, TypeOrmModule.forFeature([VoiceMessageEntity, ChatMessageEntity])],
  providers: [CommGateway, VoiceMessageService, ChatMessageService],
  controllers: [VoiceMessageController, ChatMessageController],
})
export class CommModule {}
