import { Injectable, Logger } from '@nestjs/common';
import { EventBusService } from '../../core/event-bus/event-bus.service';
import { StateMachineService } from '../../core/state-machine/state-machine.service';
import {
  TriggerConfig,
  StateTrigger,
  NumericStateTrigger,
  TimeTrigger,
  EventTrigger,
} from '../interfaces/automation-config.interface';
import { Unsubscribe } from '../interfaces/automation-runtime.interface';
import { EVENT_STATE_CHANGED } from '../../common/constants/events.constants';

@Injectable()
export class TriggerEvaluatorService {
  private readonly logger = new Logger(TriggerEvaluatorService.name);

  // Pending "for:" timers: key = automationId+triggerIndex+entityId
  private readonly forTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly eventBus: EventBusService,
    private readonly stateMachine: StateMachineService,
  ) {}

  /**
   * Attach all triggers for one automation.
   * Returns a single unsubscribe function that cleans up everything.
   */
  attachTriggers(
    automationId: string,
    triggers: TriggerConfig[],
    callback: (triggerLabel: string) => void,
  ): Unsubscribe {
    const unsubscribers: Unsubscribe[] = [];

    triggers.forEach((trigger, idx) => {
      const key = `${automationId}_t${idx}`;
      let unsub: Unsubscribe;

      switch (trigger.platform) {
        case 'state':
          unsub = this.attachStateTrigger(key, trigger, callback);
          break;
        case 'numeric_state':
          unsub = this.attachNumericStateTrigger(key, trigger, callback);
          break;
        case 'time':
          unsub = this.attachTimeTrigger(key, trigger, callback);
          break;
        case 'event':
          unsub = this.attachEventTrigger(key, trigger, callback);
          break;
        default:
          this.logger.warn(`Unknown trigger platform: ${(trigger as TriggerConfig & { platform: string }).platform}`);
          unsub = () => {};
      }

      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach((u) => u());
  }

  private attachStateTrigger(
    key: string,
    trigger: StateTrigger,
    callback: (label: string) => void,
  ): Unsubscribe {
    const entityIds = Array.isArray(trigger.entity_id)
      ? trigger.entity_id
      : [trigger.entity_id];

    const unsub = this.eventBus.listen(EVENT_STATE_CHANGED, (event) => {
      const data = event.data as { entity_id: string; old_state?: { state: string }; new_state?: { state: string } };
      if (!entityIds.includes(data.entity_id)) return;

      const oldState = data.old_state?.state;
      const newState = data.new_state?.state;

      if (trigger.from !== undefined && oldState !== trigger.from) return;
      if (trigger.to !== undefined && newState !== trigger.to) return;

      const timerKey = `${key}_${data.entity_id}`;
      const label = `state:${data.entity_id}→${newState}`;

      if (trigger.for) {
        // Cancel any existing timer for this entity
        const existing = this.forTimers.get(timerKey);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
          // Verify entity is still in the target state
          const current = this.stateMachine.getState(data.entity_id);
          if (!current) return;
          if (trigger.to !== undefined && current.state !== trigger.to) return;
          this.forTimers.delete(timerKey);
          callback(label);
        }, trigger.for * 1000);

        this.forTimers.set(timerKey, timer);
      } else {
        callback(label);
      }
    });

    return () => {
      unsub();
      // Clean up any pending "for:" timers for this trigger
      for (const [k, timer] of this.forTimers) {
        if (k.startsWith(key)) {
          clearTimeout(timer);
          this.forTimers.delete(k);
        }
      }
    };
  }

  private attachNumericStateTrigger(
    key: string,
    trigger: NumericStateTrigger,
    callback: (label: string) => void,
  ): Unsubscribe {
    // Track whether we were previously "inside" the threshold band
    let wasInside = false;

    const unsub = this.eventBus.listen(EVENT_STATE_CHANGED, (event) => {
      const data = event.data as { entity_id: string; new_state?: { state: string } };
      if (data.entity_id !== trigger.entity_id) return;

      const value = parseFloat(data.new_state?.state ?? '');
      if (isNaN(value)) return;

      const aboveOk = trigger.above === undefined || value > trigger.above;
      const belowOk = trigger.below === undefined || value < trigger.below;
      const isInside = aboveOk && belowOk;

      // Only fire on the crossing edge (outside → inside)
      if (!wasInside && isInside) {
        const label = `numeric_state:${trigger.entity_id}=${value}`;
        const timerKey = `${key}_${trigger.entity_id}`;

        if (trigger.for) {
          const existing = this.forTimers.get(timerKey);
          if (existing) clearTimeout(existing);

          const timer = setTimeout(() => {
            const current = this.stateMachine.getState(trigger.entity_id);
            const v = parseFloat(current?.state ?? '');
            if (isNaN(v)) return;
            const stillInside =
              (trigger.above === undefined || v > trigger.above) &&
              (trigger.below === undefined || v < trigger.below);
            if (!stillInside) return;
            this.forTimers.delete(timerKey);
            callback(label);
          }, trigger.for * 1000);

          this.forTimers.set(timerKey, timer);
        } else {
          callback(label);
        }
      } else if (!isInside) {
        // Cancel pending timer if value left the band
        const timerKey = `${key}_${trigger.entity_id}`;
        const existing = this.forTimers.get(timerKey);
        if (existing) {
          clearTimeout(existing);
          this.forTimers.delete(timerKey);
        }
      }

      wasInside = isInside;
    });

    return () => {
      unsub();
      const timerKey = `${key}_${trigger.entity_id}`;
      const t = this.forTimers.get(timerKey);
      if (t) { clearTimeout(t); this.forTimers.delete(timerKey); }
    };
  }

  private attachTimeTrigger(
    key: string,
    trigger: TimeTrigger,
    callback: (label: string) => void,
  ): Unsubscribe {
    const [hours, minutes] = trigger.at.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      this.logger.warn(`Invalid time trigger format: ${trigger.at} (expected HH:MM)`);
      return () => {};
    }

    const label = `time:${trigger.at}`;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const msUntilNext = (): number => {
      const now = new Date();
      const target = new Date();
      target.setHours(hours, minutes, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      return target.getTime() - now.getTime();
    };

    timeoutId = setTimeout(() => {
      callback(label);
      intervalId = setInterval(() => callback(label), 24 * 60 * 60 * 1000);
    }, msUntilNext());

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }

  private attachEventTrigger(
    key: string,
    trigger: EventTrigger,
    callback: (label: string) => void,
  ): Unsubscribe {
    const unsub = this.eventBus.listen(trigger.event_type, (event) => {
      if (trigger.event_data) {
        const data = event.data as Record<string, unknown>;
        const matches = Object.entries(trigger.event_data).every(
          ([k, v]) => data[k] === v,
        );
        if (!matches) return;
      }
      callback(`event:${trigger.event_type}`);
    });

    return unsub;
  }
}
