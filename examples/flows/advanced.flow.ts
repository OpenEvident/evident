import { defineFlow, expect } from 'evident';
import { triggerCaller } from './clients/caller-service.ts';
import { expectProcessed } from './clients/receiver-service.ts';

/**
 * Three flows demonstrating more complex compositional patterns — grouped
 * together since each one combines multiple mechanisms rather than
 * showing a single one in isolation.
 */

/**
 * The async/callback shape (mode: 'async'): the trigger returns almost
 * immediately (202), and the actual work happens afterward on a separate
 * thread. Demonstrates `delay` — since we already know this realistically
 * takes ~3s, there's no point polling from t=0; wait before starting.
 */
export const asyncCallback = defineFlow({
  name: 'async-callback',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const recordId = `async-callback-${Date.now()}`;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 3000,
      mode: 'async',
      simulateFailure: false,
    });

    // Async mode returns 202 (accepted, not completed), worth asserting directly.
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ recordId, status: 'accepted' });

    // The trigger call itself already tells us it was accepted, not completed.
    await evidence.logs('caller-service').waitFor(`trigger received for record ${recordId}`, {
      matchOn: [{ field: 'recordId', value: recordId }],
      expectBy: '500ms',
      timeout: '2s',
    });

    await expectProcessed(evidence, recordId, {
      delay: '2s', // don't even check until close to when it'd realistically be done
      expectBy: '1s',
      timeout: '10s',
    });
  },
});

/**
 * Demonstrates *why* Decision 4 requires a real imperative run() body
 * instead of a static declarative assertion list: a bulk flow needs a
 * genuine loop, checking each record independently. A single trigger fans
 * out N downstream records here (delayMs varies per record on purpose, so
 * the assertions aren't all trivially identical).
 */
export const bulkLoop = defineFlow({
  name: 'bulk-loop',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const batchId = Date.now();
    const records = [0, 1, 2, 3, 4].map((i) => ({
      recordId: `bulk-${batchId}-${i}`,
      delayMs: 200 + i * 150,
    }));

    for (const { recordId, delayMs } of records) {
      const res = await triggerCaller(trigger, {
        recordId,
        delayMs,
        mode: 'async',
        simulateFailure: false,
      });

      // Every individual trigger call in the batch must be accepted, not
      // just the batch as a whole — a partial-acceptance bug should fail
      // here, before any downstream evidence is even checked.
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ recordId, status: 'accepted' });
    }

    for (const { recordId } of records) {
      await expectProcessed(evidence, recordId, { expectBy: '1s', timeout: '5s' });
    }
  },
});

/**
 * Demonstrates the generic poll() primitive directly (Decision 8) instead
 * of the .waitFor() sugar — for a condition that needs to combine evidence
 * from more than one service in a single check, which no single-source
 * convenience method can express.
 */
export const mixedEvidenceCustomPoll = defineFlow({
  name: 'mixed-evidence-custom-poll',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence, poll }) {
    const recordId = `mixed-evidence-${Date.now()}`;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 500,
      mode: 'async',
      simulateFailure: false,
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ recordId, status: 'accepted' });

    await poll(
      async () => {
        const callerLogged = await evidence
          .logs('caller-service')
          .contains(`async receiver call completed for record ${recordId}`);
        const receiverLogged = await evidence
          .logs('receiver-service')
          .contains(`processed record ${recordId}`);

        expect(callerLogged).toBe(true);
        expect(receiverLogged).toBe(true);
      },
      { expectBy: '1s', timeout: '5s' },
    );
  },
});
