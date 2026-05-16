import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { StatesController } from './states/states.controller';
import { ServicesController } from './services/services.controller';
import { EventsController } from './events/events.controller';
import { HistoryController } from './history/history.controller';
import { ConfigController } from './config/config.controller';
import { RegistryController } from './registry/registry.controller';
import { BackupController } from './backup/backup.controller';
import { AiController } from './ai/ai.controller';
import { GlbController } from './glb/glb.controller';
import { PluginController } from './plugin/plugin.controller';
import { WeatherController } from './weather/weather.controller';
import { OtaController } from './ota/ota.controller';
import { AuthModule } from '../auth/auth.module';
import { RegistryModule } from '../registry/registry.module';
import { ContextService } from '../core/context/context.service';
import { VoiceLogModule } from '../voice-log/voice-log.module';

@Module({
  imports: [AuthModule, RegistryModule, VoiceLogModule],
  controllers: [
    HealthController,
    StatesController,
    ServicesController,
    EventsController,
    HistoryController,
    ConfigController,
    RegistryController,
    BackupController,
    AiController,
    GlbController,
    PluginController,
    WeatherController,
    OtaController,
  ],
  providers: [ContextService],
})
export class ApiModule {}
