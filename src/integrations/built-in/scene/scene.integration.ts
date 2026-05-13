import { Injectable, Logger } from '@nestjs/common';
import { StateMachineService } from '../../../core/state-machine/state-machine.service';
import { ServiceRegistryService } from '../../../core/service-registry/service-registry.service';
import {
  HaIntegration,
  IntegrationConfig,
  IntegrationManifest,
} from '../../interfaces/integration.interface';

const DOMAIN_SCENE = 'scene';

export interface SceneEntityConfig {
  id?: string;
  name: string;
  icon?: string;
  entities: Record<string, { state?: string; brightness?: number; [key: string]: unknown }>;
}

interface SceneIntegrationConfig extends IntegrationConfig {
  scenes: SceneEntityConfig[];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

@Injectable()
export class SceneIntegration implements HaIntegration {
  private readonly logger = new Logger(SceneIntegration.name);
  private readonly sceneMap = new Map<string, SceneEntityConfig>();

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_SCENE,
    name: 'Scene',
    version: '1.0.0',
    iot_class: 'assumed_state',
  };

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
  ) {}

  async setup(config: SceneIntegrationConfig): Promise<boolean> {
    const scenes = config.scenes ?? [];

    for (const scene of scenes) {
      const eid = `scene.${scene.id ?? slugify(scene.name)}`;
      this.sceneMap.set(eid, scene);
      this.stateMachine.setState(eid, 'scening', {
        friendly_name: scene.name,
        icon: scene.icon ?? '🎭',
        entity_count: Object.keys(scene.entities ?? {}).length,
        last_activated: null,
      });
    }

    this.registerServices();
    this.logger.log(`Scene integration ready: ${scenes.length} scenes`);
    return true;
  }

  async teardown(): Promise<void> {}

  private registerServices(): void {
    this.serviceRegistry.register({
      domain: DOMAIN_SCENE,
      service: 'turn_on',
      name: 'Activate scene',
      description: 'Activate a scene — applies all entity states defined in the scene',
      fields: {
        entity_id: { description: 'Scene entity ID', required: true },
      },
      handler: async (call) => {
        const eid =
          (Array.isArray(call.target?.entity_id)
            ? call.target?.entity_id[0]
            : call.target?.entity_id) ??
          (call.service_data?.entity_id as string);
        if (!eid) return;

        const scene = this.sceneMap.get(eid);
        if (!scene) {
          this.logger.warn(`Scene not found: ${eid}`);
          return;
        }

        for (const [entityId, attrs] of Object.entries(scene.entities ?? {})) {
          const current = this.stateMachine.getState(entityId);
          const targetState = (attrs.state as string) ?? current?.state ?? 'on';
          const newAttrs: Record<string, unknown> = { ...(current?.attributes ?? {}), ...attrs };
          delete newAttrs['state'];
          this.stateMachine.setState(entityId, targetState, newAttrs);
        }

        // Update last_activated timestamp on the scene entity itself
        const sceneState = this.stateMachine.getState(eid);
        this.stateMachine.setState(eid, 'scening', {
          ...sceneState?.attributes,
          last_activated: new Date().toISOString(),
        });

        this.logger.log(`Scene activated: ${scene.name} (${Object.keys(scene.entities ?? {}).length} entities)`);
      },
    });
  }
}
