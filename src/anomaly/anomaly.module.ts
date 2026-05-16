import { Module } from '@nestjs/common'
import { AnomalyService } from './anomaly.service'
import { CoreModule } from '../core/core.module'
import { PushModule } from '../push/push.module'

@Module({
  imports: [CoreModule, PushModule],
  providers: [AnomalyService],
})
export class AnomalyModule {}
