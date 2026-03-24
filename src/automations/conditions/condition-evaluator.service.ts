import { Injectable } from '@nestjs/common';
import { StateMachineService } from '../../core/state-machine/state-machine.service';
import {
  ConditionConfig,
  StateCondition,
  NumericStateCondition,
  TimeRangeCondition,
} from '../interfaces/automation-config.interface';

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

@Injectable()
export class ConditionEvaluatorService {
  constructor(private readonly stateMachine: StateMachineService) {}

  /** Returns true if ALL conditions pass. */
  evaluate(conditions: ConditionConfig[]): boolean {
    return conditions.every((c) => this.evaluateOne(c));
  }

  private evaluateOne(condition: ConditionConfig): boolean {
    switch (condition.condition) {
      case 'state':       return this.evalState(condition);
      case 'numeric_state': return this.evalNumericState(condition);
      case 'time':        return this.evalTime(condition);
      default:            return true;
    }
  }

  private evalState(c: StateCondition): boolean {
    const entity = this.stateMachine.getState(c.entity_id);
    if (!entity) return false;
    if (entity.state !== c.state) return false;

    if (c.for !== undefined) {
      const heldMs = Date.now() - Date.parse(entity.last_changed);
      if (heldMs < c.for * 1000) return false;
    }

    return true;
  }

  private evalNumericState(c: NumericStateCondition): boolean {
    const entity = this.stateMachine.getState(c.entity_id);
    if (!entity) return false;
    const value = parseFloat(entity.state);
    if (isNaN(value)) return false;
    if (c.above !== undefined && value <= c.above) return false;
    if (c.below !== undefined && value >= c.below) return false;
    return true;
  }

  private evalTime(c: TimeRangeCondition): boolean {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    if (c.after || c.before) {
      const toMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      if (c.after && c.before) {
        const after = toMinutes(c.after);
        const before = toMinutes(c.before);
        // Handle midnight wrap-around (e.g., after: "22:00", before: "06:00")
        if (after <= before) {
          if (nowMinutes < after || nowMinutes >= before) return false;
        } else {
          if (nowMinutes < after && nowMinutes >= before) return false;
        }
      } else if (c.after) {
        if (nowMinutes < toMinutes(c.after)) return false;
      } else if (c.before) {
        if (nowMinutes >= toMinutes(c.before)) return false;
      }
    }

    if (c.weekday && c.weekday.length > 0) {
      const todayNum = now.getDay();
      const allowed = c.weekday.map((d) => DAY_MAP[d]);
      if (!allowed.includes(todayNum)) return false;
    }

    return true;
  }
}
