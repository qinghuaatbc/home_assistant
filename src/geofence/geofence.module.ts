import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ZoneEntity } from './zone.entity'
import { DeviceLocationEntity } from './device-location.entity'
import { GeofenceService } from './geofence.service'
import { GeofenceController } from './geofence.controller'
import { CoreModule } from '../core/core.module'
import { AuthModule } from '../auth/auth.module'
import { PushModule } from '../push/push.module'
import { ContextService } from '../core/context/context.service'

@Module({
  imports: [TypeOrmModule.forFeature([ZoneEntity, DeviceLocationEntity]), CoreModule, AuthModule, PushModule],
  controllers: [GeofenceController],
  providers: [GeofenceService, ContextService],
})
export class GeofenceModule {}
