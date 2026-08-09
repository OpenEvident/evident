export { expect } from 'expect';

export { parseDuration } from './evidence/duration.js';

export { poll, PollTimeoutError } from './evidence/poll.js';
export type { PollOptions, PollOutcome, PollResult } from './evidence/poll.js';

export { resolveServices } from './config.js';
export type {
  CorrelationMode,
  EvidentConfig,
  ResolvedService,
  ServiceTargetConfig,
} from './config.js';

export { createTrigger, TriggerError } from './evidence/trigger.js';
export type { Trigger, TriggerRequest, TriggerResponse } from './evidence/trigger.js';

export { captureEvidenceSnapshots, createEvidence, logFileSize } from './evidence/evidence.js';
export type {
  Evidence,
  EvidenceSnapshot,
  LogEvidence,
  WaitForOptions,
} from './evidence/evidence.js';

export { redactPii, redactText, redactValue } from './evidence/redact.js';

export { defineFlow } from './flow/define-flow.js';
export type { Flow, FlowContext, FlowDefinition, SafetyLevel } from './flow/define-flow.js';

export { defineFixture } from './flow/fixture.js';
export type { Fixture, FixtureContext } from './flow/fixture.js';

export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  beginSuiteRegistration,
  configureSuite,
  endSuiteRegistration,
} from './flow/suite-context.js';
export type { HookFn, SuiteMode, SuiteRegistration } from './flow/suite-context.js';

export type { AssertionRecord, RunBundle, TriggerRecord } from './run/run-bundle.js';

export { runFlow } from './run/run-flow.js';
export type { RunFlowOptions } from './run/run-flow.js';

export { runSuite } from './run/run-suite.js';
export type { RunSuiteOptions, SkippedFlow, SuiteRunResult } from './run/run-suite.js';

export { DEFAULT_RETENTION_DAYS, pruneOldRunBundles } from './run/retention.js';
export type { PruneResult } from './run/retention.js';
