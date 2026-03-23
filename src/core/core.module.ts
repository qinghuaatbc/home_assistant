import { Global, Module } from '@nestjs/common';
import { EventBusModule } from './event-bus/event-bus.module';
import { StateMachineModule } from './state-machine/state-machine.module';
import { ServiceRegistryModule } from './service-registry/service-registry.module';

/**
 * CoreModule bundles the three fundamental HA systems:
 * - EventBus: pub/sub backbone
 * - StateMachine: immutable entity state store
 * - ServiceRegistry: domain.service handler routing
 *
 * @Global() ensures these are available throughout the app
 * without importing CoreModule in every feature module.
 */
@Global()
@Module({
  imports: [EventBusModule, StateMachineModule, ServiceRegistryModule],
  exports: [EventBusModule, StateMachineModule, ServiceRegistryModule],
})
export class CoreModule {}
