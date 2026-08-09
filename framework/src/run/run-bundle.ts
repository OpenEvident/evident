import type { CorrelationMode } from '../config.js';
import type { EvidenceSnapshot } from '../evidence/evidence.js';
import type { PollOutcome } from '../evidence/poll.js';
import type { SafetyLevel } from '../flow/define-flow.js';

export interface TriggerRecord {
  service: string;
  request: {
    method: string;
    path: string;
    body?: unknown;
  };
  firedAt: string;
  response?: {
    status: number;
    body: unknown;
  };
  error?: {
    name: string;
    message: string;
    status?: number;
  };
}

export interface AssertionRecord {
  service?: string;
  pattern?: string;
  matchOn?: string;
  value?: string;
  expectBy?: string;
  timeout?: string;
  outcome: PollOutcome | 'fail';
  durationMs: number;
  attempts: number;
  error?: string;
}

/**
 * Self-contained record of one Flow run (architecture.md §6). Written to
 * local disk by the CLI; meaningful on its own afterward, with no live
 * pointers back to the services it ran against. Redacted before being
 * returned — never carries unredacted secrets.
 */
export interface RunBundle {
  schemaVersion: 1;
  runId: string;
  /** Shared by every Flow's bundle from the same Suite run, so a reviewer can reconstruct the full sequence (flow-model.md §9.3). Absent for a standalone `runFlow` call outside a Suite. */
  suiteRunId?: string;
  flow: {
    name: string;
    services: readonly string[];
    safety: SafetyLevel;
    correlation: CorrelationMode;
  };
  target: string;
  startedAt: string;
  finishedAt: string;
  /** `pass-after-retry` — the Flow failed at least once but eventually passed within its `retries` budget. Never silently folded into a plain `pass` (flow-model.md §10.2). */
  outcome: 'pass' | 'pass-after-retry' | 'fail';
  triggers: TriggerRecord[];
  assertions: AssertionRecord[];
  /** Full raw evidence per declared service — see {@link EvidenceSnapshot}. */
  evidence: Record<string, EvidenceSnapshot>;
  error?: {
    name: string;
    message: string;
  };
}
