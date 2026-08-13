import { defineFlow, expect } from 'evident';
import {
  expectItemImported,
  expectSyncCompleted,
  expectSyncDispatched,
  expectSyncSkipped,
  importProducts,
  syncProducts,
} from './clients/bulk-import-service.ts';
import { expectProductSaved } from './clients/menu-service.ts';

/**
 * Proves a *negative* — the second hash check (`synced_products.syncedHash`
 * vs. `imported_products.contentHash`) makes a re-triggered sync for
 * already-current content a real, observable no-op, not a wasted
 * duplicate call to menu-service. This is the scenario that most directly
 * exercises why bulk-import-service keeps two separate hashes instead of
 * one: the import-time hash alone can't answer "do we actually need to
 * call menu-service right now," only "did the raw payload change since
 * last imported."
 *
 * The ordering below matters for correctness, not just readability:
 * `expectSyncSkipped` is a positive `waitFor()` (it polls until the skip
 * decision is logged), and only once that resolves is it actually safe to
 * assert the negative — the skip path returns before ever reaching
 * dispatch, so once `item.sync.skipped` is observed, no UPDATE dispatch
 * for this item could still be in flight. Checking the negative first
 * would be a race, not a proof.
 */
export const reSyncWithNoChangeIsANoOp = defineFlow({
  name: 'sync-skips-unchanged-content',
  services: ['bulk-import-service', 'menu-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const partnerId = 'flow-partner-sync-noop';
    const externalId = `sync-noop-${Date.now()}`;

    // --- Setup: get one real, synced item on the books first ---
    const importRes = await importProducts(trigger, partnerId, [
      {
        externalId,
        sku: 'SKU-FLOW-NOOP',
        name: 'Flow No-op Item',
        price: 9.5,
        currencyCode: 'AED',
        taxAssignment: { name: 'UAE VAT', percentage: 5.0 },
      },
    ]);
    await expectItemImported(evidence, importRes.body.requestId, externalId, { expectBy: '1s', timeout: '5s' });

    const firstSync = await syncProducts(trigger, partnerId, [externalId]);
    await expectSyncDispatched(evidence, firstSync.body.syncId, externalId, { expectBy: '2s', timeout: '10s' });
    await expectProductSaved(evidence, externalId, 'CREATE', { expectBy: '2s', timeout: '10s' });
    await expectSyncCompleted(evidence, firstSync.body.syncId, externalId, { expectBy: '2s', timeout: '10s' });

    // --- The scenario under test: re-trigger sync with no import in between ---
    const secondSync = await syncProducts(trigger, partnerId, [externalId]);
    expect(secondSync.status).toBe(202);
    expect(secondSync.body.selectedCount).toBe(1); // "selected" just means requested — skip is decided per-item, inside the workflow

    await expectSyncSkipped(evidence, secondSync.body.syncId, externalId, { expectBy: '1s', timeout: '5s' });

    // --- The negative: menu-service must never see a second (UPDATE) dispatch for this item ---
    const wasUpdatedAnyway = await evidence.logs('menu-service').contains('updated product', {
      matchOn: [
        { field: 'externalId', value: externalId },
        { field: 'action', value: 'UPDATE' },
        { field: 'event', value: 'product.saved' },
      ],
    });
    expect(wasUpdatedAnyway).toBe(false);
  },
});
