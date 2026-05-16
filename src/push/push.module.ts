import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PushSubscriptionEntity } from './push-subscription.entity'
import { NotificationLogEntity } from './notification-log.entity'
import { PushService } from './push.service'
import { PushController } from './push.controller'
import { NotificationRulesService } from './notification-rules.service'
import { NotificationRulesController } from './notification-rules.controller'
import { CoreModule } from '../core/core.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscriptionEntity, NotificationLogEntity]), CoreModule, AuthModule],
  controllers: [PushController, NotificationRulesController],
  providers: [PushService, NotificationRulesService],
  exports: [PushService],
})
export class PushModule {}
