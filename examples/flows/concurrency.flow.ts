import { defineFlow, expect, configureSuite } from 'evident';
import { triggerCaller } from './clients/caller-service.ts';
import { expectProcessed } from './clients/receiver-service.ts';

/**
 * Execution mode, locks, tags, skip, and Flow-level timeout/retries
 * (docs/flow-model.md §6-7, §10.1-10.3, §10.6). Every flow here generates
 * its own recordId, so parallel execution is safe by construction — no
 * isolated-context equivalent needed, per flow-model.md §6's stated
 * difference from Playwright.
 */
configureSuite({ mode: 'parallel' });

export const smokeCheck = defineFlow({
  name: 'concurrency-smoke-check',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  tags: ['smoke'],
  async run({ trigger, evidence }) {
    const recordId = `concurrency-smoke-${Date.now()}`;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 300,
      mode: 'sync',
      simulateFailure: false,
    });

    expect(res.status).toBe(200);
    await expectProcessed(evidence, recordId, { expectBy: '2s', timeout: '10s' });
  },
});

/**
 * Locked: models a Flow hitting a singleton/rate-limited downstream
 * dependency. The lock keeps it from running concurrently with any other
 * Flow sharing the same lock name, anywhere in the run, without forcing
 * this whole Suite into serial mode to protect just this one resource.
 * caller-service has no real rate limit — the lock is declared purely to
 * show the shape.
 */
export const rateLimitedCall = defineFlow({
  name: 'concurrency-rate-limited-call',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  lock: 'receiver-rate-limit',
  tags: ['regression'],
  async run({ trigger, evidence }) {
    const recordId = `concurrency-locked-${Date.now()}`;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 300,
      mode: 'sync',
      simulateFailure: false,
    });

    expect(res.status).toBe(200);
    await expectProcessed(evidence, recordId, { expectBy: '2s', timeout: '10s' });
  },
});

/**
 * Flow-level timeout ceiling and opt-in retry (flow-model.md §10.1-10.2):
 * `timeout` caps the whole run(), independent of any individual poll()'s
 * own timeout. `retries: 1` means one failure is retried before the Flow
 * is reported failed — a Flow that fails then passes records a distinct
 * "pass-after-retry" outcome, never a silent clean pass.
 */
export const retryableBulkStep = defineFlow({
  name: 'concurrency-retryable-bulk-step',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  timeout: '30s',
  retries: 1,
  async run({ trigger, evidence }) {
    const recordId = `concurrency-retryable-${Date.now()}`;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 500,
      mode: 'async',
      simulateFailure: false,
    });

    expect(res.status).toBe(202);
    await expectProcessed(evidence, recordId, { expectBy: '1s', timeout: '5s' });
  },
});

/**
 * skip (flow-model.md §10.6): disables the Flow without deleting it — the
 * string form doubles as a self-documenting reason, visible in run
 * summaries.
 */
export const pendingInvestigation = defineFlow({
  name: 'concurrency-pending-investigation',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  skip: 'flaky against receiver-service under real parallel load — tracked separately',
  async run({ trigger, evidence }) {
    const recordId = `concurrency-pending-${Date.now()}`;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 300,
      mode: 'sync',
      simulateFailure: false,
    });

    expect(res.status).toBe(200);
    await expectProcessed(evidence, recordId, { expectBy: '2s', timeout: '10s' });
  },
});
