import { Injectable, Logger } from '@nestjs/common';
import { ServiceRegistryService } from '../../core/service-registry/service-registry.service';
import { ContextService } from '../../core/context/context.service';
import { ConditionEvaluatorService } from '../conditions/condition-evaluator.service';
import {
  ActionConfig,
  CallServiceAction,
  DelayAction,
  ConditionAction,
} from '../interfaces/automation-config.interface';
import { StateContext } from '../../core/context/ha-context.interface';

const MAX_DEPTH = 10;

@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);

  constructor(
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly contextService: ContextService,
    private readonly conditionEvaluator: ConditionEvaluatorService,
  ) {}

  async execute(
    actions: ActionConfig[],
    context: StateContext,
    depth = 0,
  ): Promise<void> {
    if (depth > MAX_DEPTH) {
      this.logger.error('Max action nesting depth exceeded — possible loop');
      return;
    }

    for (const action of actions) {
      switch (action.action) {
        case 'call_service':
          await this.execCallService(action, context);
          break;
        case 'delay':
          await this.execDelay(action);
          break;
        case 'condition':
          await this.execCondition(action, context, depth);
          break;
        default:
          this.logger.warn(`Unknown action type: ${(action as ActionConfig & { action: string }).action}`);
      }
    }
  }

  private async execCallService(
    action: CallServiceAction,
    context: StateContext,
  ): Promise<void> {
    const [domain, service] = action.service.split('.');
    if (!domain || !service) {
      this.logger.warn(`Invalid service format: ${action.service}`);
      return;
    }

    try {
      await this.serviceRegistry.call({
        domain,
        service,
        service_data: action.data ?? {},
        target: action.target,
        context,
      });
    } catch (err) {
      this.logger.warn(`Service call failed: ${action.service} — ${(err as Error).message}`);
    }
  }

  private execDelay(action: DelayAction): Promise<void> {
    const seconds = Math.min(action.seconds ?? 0, 3600);
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  private async execCondition(
    action: ConditionAction,
    context: StateContext,
    depth: number,
  ): Promise<void> {
    const passed = this.conditionEvaluator.evaluate(action.conditions);
    if (passed) {
      await this.execute(action.then, context, depth + 1);
    } else if (action.else) {
      await this.execute(action.else, context, depth + 1);
    }
  }
}
