import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getTypeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'better-sqlite3',
  database: configService.get<string>('database.database', 'ha.db'),
  autoLoadEntities: true,
  synchronize: true, // In production, use migrations instead
  logging: configService.get<boolean>('database.logging', false),
});
