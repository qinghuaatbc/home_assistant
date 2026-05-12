import { Module, Global } from '@nestjs/common';
import { PluginLoaderService } from './plugin-loader.service';

@Global()
@Module({
  providers: [PluginLoaderService],
  exports: [PluginLoaderService],
})
export class PluginLoaderModule {}
