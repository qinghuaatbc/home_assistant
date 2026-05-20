import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { StateMachineService } from '../core/state-machine/state-machine.service';
import { ContextService } from '../core/context/context.service';
import { TriggerEvaluatorService } from './triggers/trigger-evaluator.service';
import { ConditionEvaluatorService } from './conditions/condition-evaluator.service';
import { ActionExecutorService } from './actions/action-executor.service';
import { AutomationConfig } from './interfaces/automation-config.interface';
import { AutomationRuntime } from './interfaces/automation-runtime.interface';

@Injectable()
export class AutomationEngineService implements OnApplicationShutdown {
  private readonly logger = new Logger(AutomationEngineService.name);
  private readonly automations = new Map<string, AutomationRuntime>();

  // Active context IDs for loop detection
  private readonly activeContextIds = new Set<string>();

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly contextService: ContextService,
    private readonly triggerEvaluator: TriggerEvaluatorService,
    private readonly conditionEvaluator: ConditionEvaluatorService,
    private readonly actionExecutor: ActionExecutorService,
  ) {}

  loadAutomations(configs: AutomationConfig[]): void {
    for (const config of configs) {
      const id = config.id ?? (config.alias ? slugify(config.alias) : uuidv4());
      this.registerAutomation(id, config);
    }
    this.logger.log(`Loaded ${configs.length} automations`);
  }

  private registerAutomation(id: string, config: AutomationConfig): void {
    const unsub = this.triggerEvaluator.attachTriggers(
      id,
      config.trigger,
      (triggerLabel) => this.onTriggered(id, triggerLabel),
    );

    const runtime: AutomationRuntime = {
      id,
      config,
      activeRuns: 0,
      unsubscribers: [unsub],
      enabled: true,
    };

    this.automations.set(id, runtime);

    this.stateMachine.setState(`automation.${id}`, 'on', {
      friendly_name: config.alias ?? id,
      mode: config.mode ?? 'single',
      last_triggered: null,
    });

    this.logger.debug(`Automation registered: ${config.alias ?? id}`);
  }

  private async onTriggered(automationId: string, triggerLabel: string): Promise<void> {
    const runtime = this.automations.get(automationId);
    if (!runtime || !runtime.enabled) return;

    const mode = runtime.config.mode ?? 'single';
    const maxRuns = runtime.config.max_runs ?? Infinity;

    if (mode === 'single' && runtime.activeRuns > 0) {
      this.logger.debug(`Automation ${automationId} already running (single mode), skipping`);
      return;
    }

    if (mode === 'parallel' && runtime.activeRuns >= maxRuns) {
      this.logger.debug(`Automation ${automationId} at max_runs (${maxRuns}), skipping`);
      return;
    }

    if (runtime.config.condition && runtime.config.condition.length > 0) {
      const passed = this.conditionEvaluator.evaluate(runtime.config.condition);
      if (!passed) {
        this.logger.debug(`Automation ${automationId} conditions not met, skipping`);
        return;
      }
    }

    const context = this.contextService.system();

    // Loop protection: prevent the same automation from re-entering while already running
    if (this.activeContextIds.has(automationId)) {
      this.logger.warn(`Automation ${automationId} loop detected, aborting`);
      return;
    }

    const now = new Date().toISOString();
    runtime.activeRuns++;
    runtime.lastTriggeredAt = now;
    runtime.lastTriggeredBy = triggerLabel;
    this.activeContextIds.add(automationId);

    this.stateMachine.setState(`automation.${automationId}`, 'on', {
      friendly_name: runtime.config.alias ?? automationId,
      mode,
      last_triggered: now,
      last_triggered_by: triggerLabel,
    });

    this.logger.log(`Automation triggered: ${runtime.config.alias ?? automationId} (${triggerLabel})`);

    try {
      await this.actionExecutor.execute(runtime.config.action, context);
    } catch (err) {
      this.logger.error(`Automation ${automationId} failed: ${(err as Error).message}`);
    } finally {
      runtime.activeRuns--;
      this.activeContextIds.delete(automationId);
    }
  }

  enable(automationId: string): void {
    const runtime = this.automations.get(automationId);
    if (runtime) {
      runtime.enabled = true;
      this.stateMachine.setState(`automation.${automationId}`, 'on', {
        friendly_name: runtime.config.alias ?? automationId,
      });
    }
  }

  disable(automationId: string): void {
    const runtime = this.automations.get(automationId);
    if (runtime) {
      runtime.enabled = false;
      this.stateMachine.setState(`automation.${automationId}`, 'off', {
        friendly_name: runtime.config.alias ?? automationId,
      });
    }
  }

  trigger(automationId: string): void {
    this.onTriggered(automationId, 'manual');
  }

  getAll(): AutomationRuntime[] {
    return Array.from(this.automations.values());
  }

  reloadAutomations(configs: AutomationConfig[]): void {
    // Tear down all existing
    for (const runtime of this.automations.values()) {
      runtime.unsubscribers.forEach((u) => u());
    }
    this.automations.clear();
    // Re-register
    this.loadAutomations(configs);
    this.logger.log(`Automations reloaded: ${configs.length} loaded`);
  }

  onApplicationShutdown(): void {
    for (const runtime of this.automations.values()) {
      runtime.unsubscribers.forEach((u) => u());
    }
    this.automations.clear();
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
