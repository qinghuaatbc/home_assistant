import { Module } from '@nestjs/common';
import { IntegrationLoaderService } from './integration-loader.service';
import { LightIntegration } from './built-in/light/light.integration';
import { SwitchIntegration } from './built-in/switch/switch.integration';
import { SensorIntegration } from './built-in/sensor/sensor.integration';
import { BinarySensorIntegration } from './built-in/binary-sensor/binary-sensor.integration';
import { Isy994Integration } from './built-in/isy994/isy994.integration';
import { Isy994ClientService } from './built-in/isy994/isy994-client.service';
import { Isy994SubscriptionService } from './built-in/isy994/isy994-subscription.service';
import { RegistryModule } from '../registry/registry.module';
import { ContextService } from '../core/context/context.service';

@Module({
  imports: [RegistryModule],
  providers: [
    IntegrationLoaderService,
    ContextService,
    // Built-in integrations
    LightIntegration,
    SwitchIntegration,
    SensorIntegration,
    BinarySensorIntegration,
    // ISY994 / Insteon
    Isy994Integration,
    Isy994ClientService,
    Isy994SubscriptionService,
  ],
  exports: [IntegrationLoaderService],
})
export class IntegrationsModule {}
