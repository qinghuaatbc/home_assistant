import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service';

/**
 * Provides the EventBusService as a global singleton.
 * @Global() ensures all modules can inject EventBusService
 * without explicitly importing EventBusModule.
 */
@Global()
@Module({
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventBusModule {}
