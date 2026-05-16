import { Module } from '@nestjs/common';
import { CommGateway } from './comm.gateway';

@Module({
  providers: [CommGateway],
})
export class CommModule {}
