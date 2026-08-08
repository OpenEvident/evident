import { defineFlow, expect } from 'evident';
import { triggerCaller } from './clients/caller-service.js';
import { expectProcessed } from './clients/receiver-service.js';

/**
 * Three sibling flows demonstrating the two-tier expectBy/timeout model
 * (Decision 6) as concretely runnable, individually-checkable outcomes —
 * not just described in prose. Once poll() exists for real, running all
 * three should produce exactly pass / pass-flagged-slow / fail.
 */

export const timeoutPass = defineFlow({
  name: 'timeout-pass',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const recordId = `timeout-pass-${Date.now()}`;

    // receiver-service's delay (400ms) resolves comfortably before expectBy.
    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 400,
      mode: 'async',
      simulateFailure: false,
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ recordId, status: 'accepted' });

    await expectProcessed(evidence, recordId, { expectBy: '2s', timeout: '10s' });
  },
});

export const timeoutSlow = defineFlow({
  name: 'timeout-slow',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const recordId = `timeout-slow-${Date.now()}`;

    // receiver-service's delay (4s) lands between expectBy (2s) and
    // timeout (10s): should still pass, but flagged slow in the run bundle.
    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 4000,
      mode: 'async',
      simulateFailure: false,
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ recordId, status: 'accepted' });

    await expectProcessed(evidence, recordId, { expectBy: '2s', timeout: '10s' });
  },
});

export const timeoutFail = defineFlow({
  name: 'timeout-fail',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const recordId = `timeout-fail-${Date.now()}`;

    // receiver-service's delay (15s) exceeds timeout (10s): the assertion
    // should fail outright, distinct from timeoutSlow's "slow but passed."
    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 15000,
      mode: 'async',
      simulateFailure: false,
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ recordId, status: 'accepted' });

    await expectProcessed(evidence, recordId, { expectBy: '2s', timeout: '10s' });
  },
});
