import { DataSource, DataSourceOptions } from 'typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { LongLivedTokenEntity } from '../auth/entities/long-lived-token.entity';
import { StateHistoryEntity } from '../core/state-machine/state.entity';
import { AreaEntity } from '../registry/area-registry/area.entity';
import { DeviceEntity } from '../registry/device-registry/device.entity';
import { EntityRegistryEntity } from '../registry/entity-registry/entity.entity';

const options: DataSourceOptions = {
  type: 'better-sqlite3',
  database: process.env.HA_DB_PATH || 'ha.db',
  entities: [
    UserEntity,
    LongLivedTokenEntity,
    StateHistoryEntity,
    AreaEntity,
    DeviceEntity,
    EntityRegistryEntity,
  ],
  migrations: ['src/database/migrations/*.ts'],
  logging: false,
};

export default new DataSource(options);
