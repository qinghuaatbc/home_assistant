import { Module } from '@nestjs/common';
import { WebrtcService } from './webrtc.service';
import { WebrtcController } from './webrtc.controller';

@Module({
  controllers: [WebrtcController],
  providers: [WebrtcService],
  exports: [WebrtcService],
})
export class WebrtcModule {}
