import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThermostatScheduleEntity } from './thermostat-schedule.entity'
import { ThermostatScheduleService } from './thermostat-schedule.service'
import { ThermostatScheduleController } from './thermostat-schedule.controller'
import { CoreModule } from '../core/core.module'
import { AuthModule } from '../auth/auth.module'
import { ContextService } from '../core/context/context.service'

@Module({
  imports: [TypeOrmModule.forFeature([ThermostatScheduleEntity]), CoreModule, AuthModule],
  controllers: [ThermostatScheduleController],
  providers: [ThermostatScheduleService, ContextService],
})
export class ScheduleModule {}
