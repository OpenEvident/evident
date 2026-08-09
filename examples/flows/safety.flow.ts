import { defineFlow, expect } from 'evident';
import { triggerCaller } from './clients/caller-service.ts';
import { expectProcessed } from './clients/receiver-service.ts';

/**
 * Three flows demonstrating the framework's safety and failure-handling
 * mechanisms — grouped together since they're all about what happens
 * around the trigger call itself, not the downstream evidence.
 */

/**
 * Demonstrates Decision 15: `safety: 'ask-first'` means `evident run` on
 * this flow refuses to execute at all unless --confirm is passed, since
 * there's no LLM inside the CLI to make that judgment call itself
 * (Guiding Principle 2). In a real system this would be a flow with a
 * genuine external side effect (a real webhook, a real charge) — modeled
 * here as caller-service's normal path, since our example services never
 * make real external calls regardless.
 */
export const askFirst = defineFlow({
  name: 'ask-first-safety',
  services: ['caller-service', 'receiver-service'],
  safety: 'ask-first',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const recordId = `ask-first-${Date.now()}`;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 300,
      mode: 'sync',
      simulateFailure: false,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recordId, status: 'completed' });

    await expectProcessed(evidence, recordId, { expectBy: '2s', timeout: '10s' });
  },
});

/**
 * Demonstrates Decision 19: trigger calls never auto-retry by default
 * (many real endpoints aren't safe to call twice), but a spec author who
 * knows a specific trigger IS safe to retry can opt in explicitly.
 * caller-service's /trigger isn't really idempotent in the strict sense
 * (calling it twice creates two downstream calls) — this flow marks it
 * idempotent anyway purely to demonstrate the option's shape; a real
 * idempotent endpoint (keyed by a client-supplied ID) is the actual
 * intended use case.
 */
export const idempotentRetry = defineFlow({
  name: 'idempotent-retry',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const recordId = `idempotent-retry-${Date.now()}`;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 300,
      mode: 'sync',
      simulateFailure: false,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recordId, status: 'completed' });

    await expectProcessed(evidence, recordId, { expectBy: '2s', timeout: '10s' });
  },
});

/**
 * Demonstrates Decision 19 from the other side: a failed trigger call must
 * be reported as a distinct "trigger failure," not lumped in with an
 * assertion failure. caller-service's simulateFailure flag returns 500
 * without ever calling receiver-service — deliberately no evidence
 * assertion below, since none should ever be reachable, and deliberately
 * no response capture/assertion either: trigger.api() is expected to
 * throw/reject on a non-2xx response, and this flow lets that happen
 * unhandled, so the framework categorizes it automatically rather than the
 * flow author catching and checking it manually. Whether trigger.api()
 * actually throws vs. returns a response the caller must check itself is
 * assumed here, not yet specified (see flows/README.md).
 */
export const triggerFailure = defineFlow({
  name: 'trigger-failure',
  services: ['caller-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger }) {
    const recordId = `trigger-failure-${Date.now()}`;

    await triggerCaller(trigger, {
      recordId,
      delayMs: 0,
      mode: 'sync',
      simulateFailure: true,
    });
  },
});
