import { Global, Module } from '@nestjs/common';
import { EventBusModule } from './event-bus/event-bus.module';
import { StateMachineModule } from './state-machine/state-machine.module';
import { ServiceRegistryModule } from './service-registry/service-registry.module';
import { PluginLoaderModule } from './plugin-loader/plugin-loader.module';

/**
 * CoreModule bundles the fundamental HA systems:
 * - EventBus: pub/sub backbone
 * - StateMachine: immutable entity state store
 * - ServiceRegistry: domain.service handler routing
 * - PluginLoader: custom_components hot-loading
 *
 * @Global() ensures these are available throughout the app.
 */
@Global()
@Module({
  imports: [EventBusModule, StateMachineModule, ServiceRegistryModule, PluginLoaderModule],
  exports: [EventBusModule, StateMachineModule, ServiceRegistryModule, PluginLoaderModule],
})
export class CoreModule {}
