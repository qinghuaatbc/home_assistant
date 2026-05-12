import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { StateMachineService } from '../../src/core/state-machine/state-machine.service';
import { EntityRegistryService } from '../../src/registry/entity-registry/entity-registry.service';
import { ContextService } from '../../src/core/context/context.service';
import {
  HaIntegration,
  IntegrationConfig,
  IntegrationManifest,
} from '../../src/integrations/interfaces/integration.interface';
import { CameraStreamService, StreamDef } from '../../src/integrations/built-in/camera/camera-stream.service';
import { DOMAIN_CAMERA, STATE_IDLE, STATE_STREAMING } from '../../src/integrations/built-in/camera/camera.constants';
import { STATE_UNAVAILABLE } from '../../src/common/constants/domains.constants';

export interface CameraStreamConfig {
  label: string;
  rtsp_url: string;
  default?: boolean;
}

export interface CameraDeviceConfig {
  name: string;
  rtsp_url?: string;
  streams?: CameraStreamConfig[];
}

interface CameraConfig extends IntegrationConfig {
  cameras: CameraDeviceConfig[];
}

const MANIFEST: IntegrationManifest = {
  domain: 'rtsp2hls',
  name: 'RTSP2HLS Camera',
  version: '1.0.0',
  iot_class: 'local_push',
  requirements: ['ffmpeg'],
};

export async function create(config: IntegrationConfig) {
  // In a full plugin system, these would be injected via DI.
  // For now, we create a minimal integration that the loader can use.
  const logger = new Logger('RTSP2HLSPlugin');
  let teardownCalled = false;

  return {
    manifest: MANIFEST,

    async setup(cfg: IntegrationConfig): Promise<boolean> {
      const c = cfg as CameraConfig;
      logger.log(`RTSP2HLS plugin setup with ${c.cameras?.length || 0} cameras`);
      return true;
    },

    async teardown(): Promise<void> {
      teardownCalled = true;
      logger.log('RTSP2HLS plugin teardown');
    },
  };
}
