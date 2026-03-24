// ── Triggers ─────────────────────────────────────────────────────────────────

export interface StateTrigger {
  platform: 'state';
  entity_id: string | string[];
  from?: string;
  to?: string;
  for?: number; // seconds to hold before firing
}

export interface NumericStateTrigger {
  platform: 'numeric_state';
  entity_id: string;
  above?: number;
  below?: number;
  for?: number;
}

export interface TimeTrigger {
  platform: 'time';
  at: string; // "HH:MM" format
}

export interface EventTrigger {
  platform: 'event';
  event_type: string;
  event_data?: Record<string, unknown>;
}

export type TriggerConfig =
  | StateTrigger
  | NumericStateTrigger
  | TimeTrigger
  | EventTrigger;

// ── Conditions ────────────────────────────────────────────────────────────────

export interface StateCondition {
  condition: 'state';
  entity_id: string;
  state: string;
  for?: number; // seconds entity must be in this state
}

export interface NumericStateCondition {
  condition: 'numeric_state';
  entity_id: string;
  above?: number;
  below?: number;
}

export interface TimeRangeCondition {
  condition: 'time';
  after?: string;  // "HH:MM"
  before?: string; // "HH:MM"
  weekday?: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
}

export type ConditionConfig =
  | StateCondition
  | NumericStateCondition
  | TimeRangeCondition;

// ── Actions ───────────────────────────────────────────────────────────────────

export interface CallServiceAction {
  action: 'call_service';
  service: string; // "domain.service_name"
  target?: { entity_id?: string | string[] };
  data?: Record<string, unknown>;
}

export interface DelayAction {
  action: 'delay';
  seconds: number;
}

export interface ConditionAction {
  action: 'condition';
  conditions: ConditionConfig[];
  then: ActionConfig[];
  else?: ActionConfig[];
}

export type ActionConfig = CallServiceAction | DelayAction | ConditionAction;

// ── Automation ────────────────────────────────────────────────────────────────

export interface AutomationConfig {
  id?: string;
  alias?: string;
  description?: string;
  mode?: 'single' | 'parallel';
  max_runs?: number;
  trigger: TriggerConfig[];
  condition?: ConditionConfig[];
  action: ActionConfig[];
}
