import { defineFlow, expect } from 'evident';
import { dispatchProductsBulk, getBulkStatus, listCurrencies } from './clients/menu-service.ts';

/**
 * The two-tier `expectBy`/`timeout` model (Decision 6), as three
 * concretely runnable, individually-checkable outcomes — not just
 * described in prose — matching the role the earlier flow set's
 * `timeout.flow.ts` played for `caller-service`/`receiver-service`.
 *
 * Needs a genuinely reproducible timing difference to do that honestly.
 * Real load-proportional latency (a bigger batch takes longer) would work
 * but is fragile — it varies by machine and isn't something a spec author
 * can reason about precisely. Real load-proportional timing IS what
 * `bulk-catalog-operations.flow.ts`'s dispatch flow exercises; this file
 * instead uses `simulateItemDelayMs`, a small, explicit, testing-only
 * field added to `POST /products/bulk`'s request DTO for exactly this
 * purpose — the same established pattern the earlier flow set's
 * `receiver-service` used its own request-level `delayMs` field for. It's
 * real code in menu-service (`ProductBulkBatchProcessor.simulateConfiguredDelay`),
 * not a flow-side fake, and it's a no-op whenever the field is absent —
 * bulk-import-service's real Sync workflow never sends it.
 */

export const bulkDispatchPass = defineFlow({
  name: 'bulk-dispatch-timing-pass',
  services: ['menu-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, poll }) {
    const currenciesRes = await listCurrencies(trigger, 'AED');
    const currency = currenciesRes.body[0];
    if (!currency) {
      throw new Error('expected a seeded AED currency');
    }

    // 100ms of configured delay resolves comfortably before expectBy.
    const dispatchRes = await dispatchProductsBulk(
      trigger,
      'flow-partner-timing-pass',
      `flow-sync-timing-pass-${Date.now().toString()}`,
      [
        {
          externalId: `timing-pass-${Date.now().toString()}`,
          action: 'CREATE',
          sku: 'SKU-TIMING-PASS',
          name: 'Timing Pass Item',
          prices: [{ currencyId: currency.id, amount: 500, taxInclusive: false, taxIds: [] }],
        },
      ],
      100,
    );

    await poll(
      async () => {
        const statusRes = await getBulkStatus(trigger, dispatchRes.body.batchId);
        expect(statusRes.body.status).toBe('COMPLETED');
      },
      { expectBy: '2s', timeout: '10s' },
    );
  },
});

export const bulkDispatchPassButFlaggedSlow = defineFlow({
  name: 'bulk-dispatch-timing-slow',
  services: ['menu-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, poll }) {
    const currenciesRes = await listCurrencies(trigger, 'AED');
    const currency = currenciesRes.body[0];
    if (!currency) {
      throw new Error('expected a seeded AED currency');
    }

    // 3s of configured delay lands between expectBy (1s) and timeout (10s):
    // should still pass, but flagged slow in the run bundle.
    const dispatchRes = await dispatchProductsBulk(
      trigger,
      'flow-partner-timing-slow',
      `flow-sync-timing-slow-${Date.now().toString()}`,
      [
        {
          externalId: `timing-slow-${Date.now().toString()}`,
          action: 'CREATE',
          sku: 'SKU-TIMING-SLOW',
          name: 'Timing Slow Item',
          prices: [{ currencyId: currency.id, amount: 500, taxInclusive: false, taxIds: [] }],
        },
      ],
      3000,
    );

    const result = await poll(
      async () => {
        const statusRes = await getBulkStatus(trigger, dispatchRes.body.batchId);
        expect(statusRes.body.status).toBe('COMPLETED');
      },
      { expectBy: '1s', timeout: '10s' },
    );
    expect(result.outcome).toBe('pass-flagged-slow');
  },
});

export const bulkDispatchFailsOnTimeout = defineFlow({
  name: 'bulk-dispatch-timing-fail',
  services: ['menu-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, poll }) {
    const currenciesRes = await listCurrencies(trigger, 'AED');
    const currency = currenciesRes.body[0];
    if (!currency) {
      throw new Error('expected a seeded AED currency');
    }

    // 6s of configured delay exceeds a deliberately tight 3s timeout: the
    // assertion should fail outright, distinct from bulkDispatchPassButFlaggedSlow's
    // "slow but passed."
    const dispatchRes = await dispatchProductsBulk(
      trigger,
      'flow-partner-timing-fail',
      `flow-sync-timing-fail-${Date.now().toString()}`,
      [
        {
          externalId: `timing-fail-${Date.now().toString()}`,
          action: 'CREATE',
          sku: 'SKU-TIMING-FAIL',
          name: 'Timing Fail Item',
          prices: [{ currencyId: currency.id, amount: 500, taxInclusive: false, taxIds: [] }],
        },
      ],
      6000,
    );

    await poll(
      async () => {
        const statusRes = await getBulkStatus(trigger, dispatchRes.body.batchId);
        expect(statusRes.body.status).toBe('COMPLETED');
      },
      { expectBy: '1s', timeout: '3s' },
    );
  },
});
