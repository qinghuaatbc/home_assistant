import { Injectable, Logger } from '@nestjs/common';
import { StateMachineService } from '../../../core/state-machine/state-machine.service';
import { EntityRegistryService } from '../../../registry/entity-registry/entity-registry.service';
import { ContextService } from '../../../core/context/context.service';
import {
  HaIntegration,
  IntegrationConfig,
  IntegrationManifest,
} from '../../interfaces/integration.interface';
import { CameraStreamService, StreamDef } from './camera-stream.service';
import { DOMAIN_CAMERA, STATE_IDLE, STATE_STREAMING } from './camera.constants';
import { STATE_UNAVAILABLE } from '../../../common/constants/domains.constants';

export interface CameraStreamConfig {
  /** Display label shown on the toggle button (e.g. "SD", "HD") */
  label: string;
  /** Full RTSP URL */
  rtsp_url: string;
  /** Set true to make this the default quality shown on load */
  default?: boolean;
}

export interface CameraDeviceConfig {
  /** Friendly name */
  name: string;
  /** Single RTSP URL — shorthand when there's only one stream */
  rtsp_url?: string;
  /** Multiple quality streams */
  streams?: CameraStreamConfig[];
}

interface CameraConfig extends IntegrationConfig {
  cameras: CameraDeviceConfig[];
}

@Injectable()
export class CameraIntegration implements HaIntegration {
  private readonly logger = new Logger(CameraIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_CAMERA,
    name: 'Camera',
    version: '1.0.0',
    iot_class: 'local_push',
    requirements: ['ffmpeg'],
  };

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
    private readonly streamService: CameraStreamService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    const cfg = config as CameraConfig;

    if (!cfg.cameras?.length) {
      this.logger.error('Camera: at least one camera must be configured');
      return false;
    }

    for (const cam of cfg.cameras) {
      // Normalise to streams array
      const streams: StreamDef[] = cam.streams
        ? cam.streams.map(s => ({ label: s.label, rtspUrl: s.rtsp_url }))
        : [{ label: 'Main', rtspUrl: cam.rtsp_url! }];

      const defaultStream = cam.streams?.find(s => s.default) ?? cam.streams?.[0];
      const defaultLabel = defaultStream?.label ?? streams[0].label;

      const entityId = this.buildEntityId(cam.name);

      // Build quality stream URLs for attributes
      const streamAttrs = streams.map(s => ({
        label: s.label,
        hls: `/api/camera/hls/${entityId}/index.m3u8?quality=${s.label.toLowerCase()}`,
      }));

      const defaultHls = `/api/camera/hls/${entityId}/index.m3u8?quality=${defaultLabel.toLowerCase()}`;

      await this.entityRegistry.registerEntity({
        entity_id: entityId,
        platform: DOMAIN_CAMERA,
        name: cam.name,
        original_name: cam.name,
        unique_id: `rtsp2hls_${cam.name}`,
        device_class: 'camera',
      });

      const buildAttrs = () => ({
        friendly_name: cam.name,
        hls_url: defaultHls,
        streams: streamAttrs,
        supported_features: 2,
      });

      this.stateMachine.setState(
        entityId,
        STATE_IDLE,
        buildAttrs(),
        this.contextService.system(),
      );

      this.streamService.registerCamera(entityId, streams, defaultLabel, (state) => {
        this.stateMachine.setState(
          entityId,
          state === 'streaming' ? STATE_STREAMING : STATE_UNAVAILABLE,
          buildAttrs(),
          this.contextService.system(),
        );
      });

      this.logger.log(`Camera registered: ${entityId} (${streams.map(s => s.label).join('/')})`);
    }

    return true;
  }

  async teardown(): Promise<void> {
    this.logger.log('Camera integration teardown complete');
  }

  private buildEntityId(name: string): string {
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `camera.rtsp2hls_${slug}`;
  }
}
