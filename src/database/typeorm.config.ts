import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getTypeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'better-sqlite3',
  database: configService.get<string>('database.database', 'ha.db'),
  autoLoadEntities: true,
  synchronize: false,
  migrationsRun: true,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  logging: configService.get<boolean>('database.logging', false),
});
