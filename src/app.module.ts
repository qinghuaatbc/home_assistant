import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import haConfigLoader from './config/ha-config.loader';
import { CoreModule } from './core/core.module';
import { RegistryModule } from './registry/registry.module';
import { AuthModule } from './auth/auth.module';
import { WebSocketModule } from './websocket/websocket.module';
import { ApiModule } from './api/api.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { EventBusService } from './core/event-bus/event-bus.service';
import { IntegrationLoaderService } from './integrations/integration-loader.service';
import {
  EVENT_HOMEASSISTANT_START,
  EVENT_HOMEASSISTANT_STARTED,
} from './common/constants/events.constants';
import { ContextService } from './core/context/context.service';

@Module({
  imports: [
    // Global configuration (highest priority)
    ConfigModule.forRoot({
      isGlobal: true,
      load: [haConfigLoader],
    }),

    // Database (TypeORM with SQLite)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'better-sqlite3' as const,
        database: configService.get<string>('database.database', 'ha.db'),
        autoLoadEntities: true,
        synchronize: process.env.NODE_ENV !== 'production',
        logging: configService.get<boolean>('database.logging', false),
      }),
      inject: [ConfigService],
    }),

    // Core HA engine (global)
    CoreModule,

    // Entity/Device/Area registries
    RegistryModule,

    // Authentication
    AuthModule,

    // WebSocket API gateway
    WebSocketModule,

    // REST API controllers
    ApiModule,

    // Integration plugin system
    IntegrationsModule,
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger('HomeAssistant');

  constructor(
    private readonly eventBus: EventBusService,
    private readonly integrationLoader: IntegrationLoaderService,
    private readonly contextService: ContextService,
  ) {}

  /**
   * Application bootstrap sequence:
   * 1. Fire homeassistant_start (state machine restores from DB)
   * 2. Load all configured integrations
   * 3. Fire homeassistant_started
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('');
    this.logger.log('╔═══════════════════════════════════════╗');
    this.logger.log('║       Home Assistant (NestJS)          ║');
    this.logger.log('║           Version 2026.3.0             ║');
    this.logger.log('╚═══════════════════════════════════════╝');
    this.logger.log('');

    // Phase 1: Start event (state machine restores states)
    this.eventBus.fire(
      EVENT_HOMEASSISTANT_START,
      {},
      this.contextService.system(),
    );
    this.logger.log('Event: homeassistant_start fired');

    // Phase 2: Load integrations
    await this.integrationLoader.loadIntegrations();

    // Phase 3: System is ready
    this.eventBus.fire(
      EVENT_HOMEASSISTANT_STARTED,
      {},
      this.contextService.system(),
    );
    this.logger.log('Event: homeassistant_started fired');
    this.logger.log('Home Assistant is running!');
  }
}
