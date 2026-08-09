import type { CorrelationMode } from './config.js';
import type { Evidence } from './evidence.js';
import { poll } from './poll.js';
import type { Trigger } from './trigger.js';

export type SafetyLevel = 'safe' | 'ask-first';

export interface FlowContext {
  trigger: Trigger;
  evidence: Evidence;
  poll: typeof poll;
}

export interface Flow {
  name: string;
  services: readonly string[];
  safety: SafetyLevel;
  correlation: CorrelationMode;
  run(context: FlowContext): Promise<void>;
}

/** Declares a Flow: static metadata (readable without executing anything) plus an imperative body. */
export function defineFlow(flow: Flow): Flow {
  return flow;
}
