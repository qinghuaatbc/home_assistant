import { Module } from '@nestjs/common'
import { SunService } from './sun.service'
import { SunController } from './sun.controller'
import { CoreModule } from '../core/core.module'
import { AuthModule } from '../auth/auth.module'
import { PushModule } from '../push/push.module'
import { ContextService } from '../core/context/context.service'

@Module({
  imports: [CoreModule, AuthModule, PushModule],
  controllers: [SunController],
  providers: [SunService, ContextService],
  exports: [SunService],
})
export class SunModule {}
