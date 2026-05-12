import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { HaExceptionFilter } from './common/filters/ha-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { SocketIoAdapter } from './websocket/socket-io.adapter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // Serve frontend from public/
  app.useStaticAssets(join(__dirname, '..', 'public'));
  // Serve uploaded files from data/ (GLB, etc.)
  app.useStaticAssets(join(__dirname, '..', 'data'), { prefix: '/data' });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('http.port', 8123);
  const corsOrigins = configService.get<string[]>('http.cors_allowed_origins', ['*']);

  // Refuse to start in production with the default insecure JWT secret
  const jwtSecret = configService.get<string>('auth.jwt_secret');
  if (jwtSecret === 'CHANGE_THIS_SECRET') {
    if (process.env.NODE_ENV === 'production') {
      logger.error('FATAL: auth.jwt_secret is still the default value. Set HA_JWT_SECRET or configure it in configuration.yaml before running in production.');
      process.exit(1);
    } else {
      logger.warn('WARNING: auth.jwt_secret is using the insecure default. Set HA_JWT_SECRET before deploying to production.');
    }
  }

  // Use custom adapter so WebSocket CORS respects cors_allowed_origins config
  app.useWebSocketAdapter(new SocketIoAdapter(app));

  // CORS configuration
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // SPA fallback: serve index.html for client-side routes
  const publicDir = join(__dirname, '..', 'public');
  app.use((req: any, res: any, next: any) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/data/') || req.path.startsWith('/assets/') || req.path === '/') return next();
    res.sendFile(join(publicDir, 'index.html'));
  });

  // Global prefix for REST API (WebSocket uses its own path)
  // Auth routes are kept outside /api prefix for HA compatibility
  app.setGlobalPrefix('api');

  // Global validation pipe (mirrors HA's strict input validation)
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter (HA error format)
  app.useGlobalFilters(new HaExceptionFilter());

  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger documentation at /api/doc
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Home Assistant API')
    .setDescription(
      'REST API for Home Assistant - entity states, services, events, and more',
    )
    .setVersion('2026.3.0')
    .addBearerAuth()
    .addTag('health', 'Health check')
    .addTag('auth', 'Authentication')
    .addTag('states', 'Entity states')
    .addTag('services', 'Integration services')
    .addTag('events', 'Event bus')
    .addTag('history', 'State history')
    .addTag('config', 'HA configuration')
    .addTag('registry', 'Entity/Device/Area registries')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/doc', app, document);

  await app.listen(port);

  logger.log('');
  logger.log(`REST API:      http://localhost:${port}/api`);
  logger.log(`Swagger Docs:  http://localhost:${port}/api/doc`);
  logger.log(`WebSocket:     ws://localhost:${port}/api/websocket`);
  logger.log('');
}

bootstrap().catch((err) => {
  console.error('Failed to start Home Assistant:', err);
  process.exit(1);
});
