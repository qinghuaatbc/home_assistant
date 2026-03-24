import { Module } from '@nestjs/common';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationIntegration } from './automation.integration';
import { TriggerEvaluatorService } from './triggers/trigger-evaluator.service';
import { ConditionEvaluatorService } from './conditions/condition-evaluator.service';
import { ActionExecutorService } from './actions/action-executor.service';
import { ContextService } from '../core/context/context.service';

@Module({
  providers: [
    AutomationEngineService,
    AutomationIntegration,
    TriggerEvaluatorService,
    ConditionEvaluatorService,
    ActionExecutorService,
    ContextService,
  ],
  exports: [AutomationIntegration, AutomationEngineService],
})
export class AutomationModule {}
