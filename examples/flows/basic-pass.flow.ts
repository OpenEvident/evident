import { defineFlow, expect } from 'evident';
import { triggerCaller } from './clients/caller-service.js';
import { expectProcessed } from './clients/receiver-service.js';

/**
 * The simplest possible flow: trigger, one assertion, done. This is the
 * baseline every other sketch in this folder builds on.
 */
export default defineFlow({
  name: 'basic-pass',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const recordId = `basic-pass-${Date.now()}`;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 300,
      mode: 'sync',
      simulateFailure: false,
    });

    // Sync mode blocks until receiver-service responds — the response
    // itself already confirms completion, before any log is even checked.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recordId, status: 'completed' });

    await expectProcessed(evidence, recordId, { expectBy: '2s', timeout: '10s' });
  },
});
