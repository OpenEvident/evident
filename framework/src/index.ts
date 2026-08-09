export { expect } from 'expect';

export { parseDuration } from './duration.js';

export { poll, PollTimeoutError } from './poll.js';
export type { PollOptions, PollOutcome, PollResult } from './poll.js';

export { resolveServices } from './config.js';
export type {
  CorrelationMode,
  EvidentConfig,
  ResolvedService,
  ServiceTargetConfig,
} from './config.js';

export { createTrigger, TriggerError } from './trigger.js';
export type { Trigger, TriggerRequest, TriggerResponse } from './trigger.js';

export { createEvidence, logFileSize } from './evidence.js';
export type { Evidence, LogEvidence, WaitForOptions } from './evidence.js';

export { defineFlow } from './define-flow.js';
export type { Flow, FlowContext, SafetyLevel } from './define-flow.js';

export { runFlow } from './run-flow.js';
export type { RunFlowOptions } from './run-flow.js';
