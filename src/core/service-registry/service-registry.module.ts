import { Module } from '@nestjs/common';
import { ServiceRegistryService } from './service-registry.service';
import { ContextService } from '../context/context.service';

@Module({
  providers: [ServiceRegistryService, ContextService],
  exports: [ServiceRegistryService],
})
export class ServiceRegistryModule {}
