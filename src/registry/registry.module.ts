import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryEntity } from './entity-registry/entity.entity';
import { EntityRegistryService } from './entity-registry/entity-registry.service';
import { DeviceEntity } from './device-registry/device.entity';
import { DeviceRegistryService } from './device-registry/device-registry.service';
import { AreaEntity } from './area-registry/area.entity';
import { AreaRegistryService } from './area-registry/area-registry.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EntityRegistryEntity,
      DeviceEntity,
      AreaEntity,
    ]),
  ],
  providers: [
    EntityRegistryService,
    DeviceRegistryService,
    AreaRegistryService,
  ],
  exports: [
    EntityRegistryService,
    DeviceRegistryService,
    AreaRegistryService,
  ],
})
export class RegistryModule {}
