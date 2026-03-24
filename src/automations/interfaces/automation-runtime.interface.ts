import { AutomationConfig } from './automation-config.interface';

export type Unsubscribe = () => void;

export interface AutomationRuntime {
  id: string;
  config: AutomationConfig;
  activeRuns: number;
  unsubscribers: Unsubscribe[];
  lastTriggeredAt?: string;
  lastTriggeredBy?: string;
  enabled: boolean;
}
