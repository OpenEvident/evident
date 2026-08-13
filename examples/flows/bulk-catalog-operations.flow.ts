import { configureSuite, defineFlow, expect } from 'evident';
import { expectItemImported, expectSyncCompleted, expectSyncDispatched, importProducts, syncProducts } from './clients/bulk-import-service.ts';
import { dispatchProductsBulk, expectProductSaved, getBulkStatus, listCurrencies, type BulkProductItem } from './clients/menu-service.ts';

/**
 * Parallel execution mode, a lock, tags, Flow-level `timeout`/`retries`,
 * `skip`, and a REST-response-polled custom `poll()` condition — every
 * Flow here generates its own partnerId/externalId(s), so parallel
 * execution is safe by construction, matching the framework's own
 * precedent (flow-model.md §6).
 */
configureSuite({ mode: 'parallel' });

function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

export const catalogSmokeCheck = defineFlow({
  name: 'bulk-catalog-smoke-check',
  services: ['bulk-import-service', 'menu-service'],
  safety: 'safe',
  correlation: 'heuristic',
  tags: ['smoke'],
  async run({ trigger, evidence }) {
    const partnerId = 'flow-partner-bulk-smoke';
    const externalId = `bulk-smoke-${Date.now().toString()}`;

    const importRes = await importProducts(trigger, partnerId, [
      { externalId, sku: 'SKU-FLOW-SMOKE', name: 'Flow Smoke Item', price: 5.0, currencyCode: 'AED', taxAssignment: { name: 'UAE VAT', percentage: 5.0 } },
    ]);
    await expectItemImported(evidence, importRes.body.requestId, externalId, { expectBy: '1s', timeout: '5s' });

    const syncRes = await syncProducts(trigger, partnerId, [externalId]);
    await expectSyncDispatched(evidence, syncRes.body.syncId, externalId, { expectBy: '2s', timeout: '10s' });
    await expectProductSaved(evidence, externalId, 'CREATE', { expectBy: '2s', timeout: '10s' });
  },
});

/**
 * Locked: a real, not artificial, reason to serialize. Two syncs for the
 * SAME `(partnerId, externalId)` racing concurrently could both read "no
 * existing synced_products yet" before either one commits its write —
 * bulk-import-service's Sync workflow doesn't take a per-item database
 * lock, only a Redis per-item state slot, so two truly concurrent
 * requests for the identical item are a genuine, not hypothetical,
 * correctness risk in this implementation. Nothing else in this Suite
 * declares this same lock name, so — same honest caveat as the
 * framework's own established precedent — it isn't exercised by real
 * contention within this one parallel run; it protects against two
 * separate `evident run` invocations (or two Suites) targeting the same
 * partner's sync queue at once.
 */
export const lockedSyncOfARaceProneItem = defineFlow({
  name: 'bulk-catalog-locked-sync',
  services: ['bulk-import-service', 'menu-service'],
  safety: 'safe',
  correlation: 'heuristic',
  lock: 'bulk-import-sync-queue',
  tags: ['regression'],
  async run({ trigger, evidence }) {
    const partnerId = 'flow-partner-bulk-locked';
    const externalId = `bulk-locked-${Date.now().toString()}`;

    const importRes = await importProducts(trigger, partnerId, [
      { externalId, sku: 'SKU-FLOW-LOCKED', name: 'Flow Locked Item', price: 6.0, currencyCode: 'AED', taxAssignment: { name: 'UAE VAT', percentage: 5.0 } },
    ]);
    await expectItemImported(evidence, importRes.body.requestId, externalId, { expectBy: '1s', timeout: '5s' });

    const syncRes = await syncProducts(trigger, partnerId, [externalId]);
    await expectSyncDispatched(evidence, syncRes.body.syncId, externalId, { expectBy: '2s', timeout: '10s' });
    await expectProductSaved(evidence, externalId, 'CREATE', { expectBy: '2s', timeout: '10s' });
  },
});

/**
 * Calls menu-service's `POST /products/bulk` directly (the endpoint
 * bulk-import-service's Sync workflow normally calls internally) with a
 * batch of pre-resolved items, then polls `GET /bulk/{batchId}/status`
 * directly — a genuine REST-response custom `poll()` condition, a
 * mechanism none of this suite's other flows exercise (they all poll log
 * evidence). `batchId` comes back directly in the trigger response body;
 * there's no way to extract it from a matched log line instead (a
 * `waitFor()` match only confirms a pattern was found, it never returns
 * captured field values), which is *why* this flow calls menu-service's
 * bulk endpoint directly instead of going through bulk-import-service's
 * `/sync` (whose own dispatch batchId is only ever visible in its log
 * line, unreachable from here).
 *
 * `timeout`/`retries`: a real ceiling and a real opt-in retry for a
 * multi-item batch that's inherently more failure-prone than a
 * single-item call.
 *
 * Restart-recovery honesty note: menu-service's `ApplicationReadyEvent`
 * listener resumes any batch left mid-flight on its own next startup
 * (`batch.recovery.resumed`) — but nothing in `defineFlow`'s actual
 * capability surface (`trigger.api()` + `evidence.logs()`) can kill or
 * restart a service process, so a Flow genuinely cannot automate that
 * scenario end to end. To see it for real: run this flow, and within a
 * couple of seconds of it starting, manually stop and restart
 * menu-service (`Ctrl+C`, then `mvn spring-boot:run` again) — watch for
 * `batch.recovery.resumed` in its log, and this flow's own poll below
 * should still eventually observe the batch reach `COMPLETED`.
 */
export const bulkDispatchCompletesAcrossManyItems = defineFlow({
  name: 'bulk-catalog-dispatch-completes',
  services: ['menu-service'],
  safety: 'safe',
  correlation: 'heuristic',
  timeout: '60s',
  retries: 1,
  async run({ trigger, poll }) {
    const currenciesRes = await listCurrencies(trigger, 'AED');
    const currency = requireDefined(currenciesRes.body[0], 'expected a seeded AED currency');

    const batchTag = Date.now().toString();
    const items: BulkProductItem[] = Array.from({ length: 15 }, (_, i) => ({
      externalId: `bulk-batch-${batchTag}-${i.toString()}`,
      action: 'CREATE',
      sku: `SKU-FLOW-BATCH-${i.toString()}`,
      name: `Flow Batch Item ${i.toString()}`,
      prices: [{ currencyId: currency.id, amount: 500 + i, taxInclusive: false, taxIds: [] }],
    }));

    const dispatchRes = await dispatchProductsBulk(trigger, `flow-partner-bulk-${batchTag}`, `flow-sync-${batchTag}`, items);
    expect(dispatchRes.status).toBe(202);
    expect(dispatchRes.body.jobCount).toBe(items.length);

    await poll(
      async () => {
        const statusRes = await getBulkStatus(trigger, dispatchRes.body.batchId);
        expect(statusRes.status).toBe(200);
        expect(statusRes.body.status).toBe('COMPLETED');
        expect(statusRes.body.completed).toBe(items.length);
        expect(statusRes.body.failed).toBe(0);
      },
      { expectBy: '5s', timeout: '30s' },
    );
  },
});

/**
 * `skip` (flow-model.md §10.6): disables the Flow without deleting it.
 * The string form doubles as a self-documenting reason. This one is
 * genuinely, permanently out of reach rather than temporarily flaky —
 * automating a real mid-batch process kill/restart needs a
 * process-lifecycle primitive `defineFlow`'s trigger/evidence surface
 * doesn't have (see `bulkDispatchCompletesAcrossManyItems`'s restart note
 * for the manual recipe). Kept here, skipped, as an honest marker of a
 * real capability boundary rather than silently omitting the scenario.
 */
export const pendingRestartRecoveryAutomation = defineFlow({
  name: 'bulk-catalog-restart-recovery-automation',
  services: ['menu-service'],
  safety: 'safe',
  correlation: 'heuristic',
  skip: 'requires killing and restarting menu-service mid-batch — no process-lifecycle primitive exists in trigger.api()/evidence.logs() to automate that; see the manual recipe in bulkDispatchCompletesAcrossManyItems\'s doc comment',
  async run() {
    // Intentionally unimplemented — see `skip` above.
  },
});
