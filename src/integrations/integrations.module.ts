import { Module } from '@nestjs/common';
import { IntegrationLoaderService } from './integration-loader.service';
import { LightIntegration } from './built-in/light/light.integration';
import { SwitchIntegration } from './built-in/switch/switch.integration';
import { SensorIntegration } from './built-in/sensor/sensor.integration';
import { BinarySensorIntegration } from './built-in/binary-sensor/binary-sensor.integration';
import { Isy994Integration } from './built-in/isy994/isy994.integration';
import { Isy994ClientService } from './built-in/isy994/isy994-client.service';
import { Isy994SubscriptionService } from './built-in/isy994/isy994-subscription.service';
import { WeatherIntegration } from './built-in/weather/weather.integration';
import { YamahaAvrIntegration } from './built-in/yamaha-avr/yamaha-avr.integration';
import { YamahaAvrClientService } from './built-in/yamaha-avr/yamaha-avr-client.service';
import { LutronCasetaIntegration } from './built-in/lutron-caseta/lutron-caseta.integration';
import { LutronCasetaClientService } from './built-in/lutron-caseta/lutron-caseta-client.service';
import { MqttIntegration } from './built-in/mqtt/mqtt.integration';
import { MqttClientService } from './built-in/mqtt/mqtt-client.service';
import { CameraIntegration } from './built-in/camera/camera.integration';
import { CameraStreamService } from './built-in/camera/camera-stream.service';
import { CameraController } from './built-in/camera/camera.controller';
import { RegistryModule } from '../registry/registry.module';
import { ContextService } from '../core/context/context.service';
import { AutomationModule } from '../automations/automation.module';
import { AutomationIntegration } from '../automations/automation.integration';
import { DemoIntegration } from './built-in/demo/demo.integration';

@Module({
  imports: [RegistryModule, AutomationModule],
  controllers: [CameraController],
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
    // Weather
    WeatherIntegration,
    // Yamaha AV Receiver
    YamahaAvrIntegration,
    YamahaAvrClientService,
    // Lutron Caséta
    LutronCasetaIntegration,
    LutronCasetaClientService,
    // MQTT
    MqttIntegration,
    MqttClientService,
    // Camera
    CameraIntegration,
    CameraStreamService,
    // Demo
    DemoIntegration,
  ],
  exports: [IntegrationLoaderService],
})
export class IntegrationsModule {}
