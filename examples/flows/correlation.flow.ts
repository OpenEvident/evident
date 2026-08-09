import { defineFlow, expect } from 'evident';
import { triggerCaller } from './clients/caller-service.ts';
import { expectProcessed } from './clients/receiver-service.ts';

/**
 * Both correlation modes (Decision 2/18), side by side, so the ergonomic
 * difference between them is visible in code, not just prose.
 */

export const heuristicMode = defineFlow({
  name: 'correlation-heuristic-mode',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const recordId = `heuristic-${Date.now()}`;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 300,
      mode: 'sync',
      simulateFailure: false,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recordId, status: 'completed' });

    // No OTel agent required — works out of the box against these services
    // as configured in evident.config.ts. The correlation guarantee comes
    // entirely from the declared matchOn field plus the trigger-fire-time
    // lower bound (baked into expectProcessed) — nothing implicit.
    await expectProcessed(evidence, recordId, { expectBy: '2s', timeout: '10s' });
  },
});

export const traceMode = defineFlow({
  name: 'correlation-trace-mode',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'trace',
  async run({ trigger, evidence }) {
    const recordId = `trace-${Date.now()}`;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 300,
      mode: 'sync',
      simulateFailure: false,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recordId, status: 'completed' });

    // Requires both services relaunched with the OTel Java agent attached
    // (see examples/services/README.md) AND evident.config.ts's correlation
    // field set to 'trace' for both services first — not the case by
    // default right now (open question, see flows/README.md).
    //
    // Deliberately bypasses expectProcessed() and calls evidence.logs()
    // directly, WITHOUT matchOn — that's the point: in trace mode,
    // correlation is automatic from the config's declared mode, and the
    // spec author shouldn't need to think about it. expectProcessed()
    // always adds matchOn, so it doesn't fit this case.
    await evidence.logs('receiver-service').waitFor(`processed record ${recordId}`, {
      expectBy: '2s',
      timeout: '10s',
    });
  },
});
