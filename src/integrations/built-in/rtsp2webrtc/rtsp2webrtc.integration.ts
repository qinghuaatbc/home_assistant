import { Injectable, Logger } from '@nestjs/common';
import { StateMachineService } from '../../../core/state-machine/state-machine.service';
import { EntityRegistryService } from '../../../registry/entity-registry/entity-registry.service';
import { ContextService } from '../../../core/context/context.service';
import {
  HaIntegration,
  IntegrationConfig,
  IntegrationManifest,
} from '../../interfaces/integration.interface';
import { WebrtcService } from '../../../api/webrtc/webrtc.service';

export interface Rtsp2WebrtcCameraConfig {
  name: string;
  rtsp_url: string;
}

interface Rtsp2WebrtcConfig extends IntegrationConfig {
  cameras: Rtsp2WebrtcCameraConfig[];
}

@Injectable()
export class Rtsp2WebrtcIntegration implements HaIntegration {
  private readonly logger = new Logger(Rtsp2WebrtcIntegration.name);
  private registeredNames: string[] = [];

  readonly manifest: IntegrationManifest = {
    domain: 'rtsp2webrtc',
    name: 'RTSP to WebRTC',
    version: '1.0.0',
    iot_class: 'local_push',
    requirements: ['go2rtc'],
  };

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
    private readonly webrtcService: WebrtcService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    const cfg = config as Rtsp2WebrtcConfig;

    if (!cfg.cameras?.length) {
      this.logger.error('rtsp2webrtc: at least one camera must be configured');
      return false;
    }

    for (const cam of cfg.cameras) {
      const slug = cam.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const entityId = `camera.rtsp2webrtc_${slug}`;
      // go2rtc stream name must match entityId.replace(/[^a-z0-9_]/g, '_') so the frontend can resolve it
      const go2rtcName = entityId.replace(/[^a-z0-9_]/g, '_');

      this.webrtcService.registerIntegrationStream(go2rtcName, cam.rtsp_url, entityId);
      this.registeredNames.push(go2rtcName);

      await this.entityRegistry.registerEntity({
        entity_id: entityId,
        platform: 'rtsp2webrtc',
        name: cam.name,
        original_name: cam.name,
        unique_id: `rtsp2webrtc_${slug}`,
        device_class: 'camera',
      });

      this.stateMachine.setState(
        entityId,
        'idle',
        { friendly_name: cam.name, stream_name: go2rtcName },
        this.contextService.system(),
      );

      this.logger.log(`WebRTC camera registered: ${entityId} → go2rtc:${go2rtcName}`);
    }

    return true;
  }

  async teardown(): Promise<void> {
    for (const name of this.registeredNames) {
      this.webrtcService.unregisterIntegrationStream(name);
    }
    this.registeredNames = [];
  }
}
