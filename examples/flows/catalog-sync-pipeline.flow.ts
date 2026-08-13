import { defineFlow, expect } from 'evident';
import {
  expectItemImported,
  expectSyncCompleted,
  expectSyncDispatched,
  importProducts,
  syncProducts,
} from './clients/bulk-import-service.ts';
import {
  attachProducts,
  createMenu,
  expectProductSaved,
  expectProductsAttached,
  listCountries,
  listCurrencies,
  listProducts,
  publishMenu,
} from './clients/menu-service.ts';
import { expectMenuPublished, getMaterializedView } from './clients/publishing-service.ts';

/**
 * The flagship, real end-to-end business scenario across all three
 * services: a partner's raw product data is imported, synced into the
 * catalogue (resolving currency/tax references, dispatching to
 * menu-service, closing the loop via callback), manually assembled into a
 * menu, explicitly published, and the resulting materialized view is read
 * back and checked for the *correct tax math* — not just that a log line
 * fired. This is the closest thing this suite has to "prove the whole
 * system actually works," the role basic-pass.flow.ts played for the
 * smaller caller/receiver-service pair.
 *
 * Deliberately mixes both evidence styles the framework supports: log
 * assertions (`evidence.logs().waitFor()`) for internal async work no
 * response body ever surfaces (the dispatch-to-menu-service hop, the
 * callback closing it), and REST response-value assertions
 * (`expect(...).toBe(...)` against a `trigger.api()` result) for state a
 * GET endpoint already exposes directly — reading the productId, real
 * currency/country IDs, and the final materialized price back from actual
 * response bodies rather than trying to extract them out of a matched log
 * line, which the framework has no mechanism for (a `waitFor()` match
 * only confirms a pattern was found, it doesn't hand back captured field
 * values).
 */
export default defineFlow({
  name: 'catalog-sync-pipeline',
  services: ['bulk-import-service', 'menu-service', 'publishing-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const partnerId = 'flow-partner-catalog-pipeline';
    const externalId = `catalog-pipeline-${Date.now()}`;

    // --- Import: raw partner data, no real IDs yet ---
    const importRes = await importProducts(trigger, partnerId, [
      {
        externalId,
        sku: 'SKU-FLOW-CHEESEBURGER',
        name: 'Flow Cheeseburger',
        price: 13.0,
        currencyCode: 'AED',
        taxAssignment: { name: 'UAE VAT', percentage: 5.0 },
      },
    ]);
    expect(importRes.status).toBe(202);
    expect(importRes.body.summary.new).toBe(1);
    await expectItemImported(evidence, importRes.body.requestId, externalId, { expectBy: '1s', timeout: '5s' });

    // --- Sync: resolve currency/tax against menu-service, dispatch, close the loop via callback ---
    const syncRes = await syncProducts(trigger, partnerId, [externalId]);
    expect(syncRes.status).toBe(202);
    expect(syncRes.body.selectedCount).toBe(1);

    await expectSyncDispatched(evidence, syncRes.body.syncId, externalId, { expectBy: '2s', timeout: '10s' });
    await expectProductSaved(evidence, externalId, 'CREATE', { expectBy: '2s', timeout: '10s' });
    await expectSyncCompleted(evidence, syncRes.body.syncId, externalId, { expectBy: '2s', timeout: '10s' });

    // --- Read back the real IDs menu-service just assigned/already owns ---
    const productsRes = await listProducts(trigger, 'ACTIVE');
    const product = productsRes.body.find((p) => p.externalId === externalId);
    if (!product) {
      throw new Error(`expected menu-service to have created a product for externalId=${externalId}`);
    }

    const currenciesRes = await listCurrencies(trigger, 'AED');
    const currency = currenciesRes.body[0];
    if (!currency) {
      throw new Error('expected menu-service to have a seeded AED currency');
    }
    const countriesRes = await listCountries(trigger);
    const country = countriesRes.body.find((c) => c.defaultCurrencyId === currency.id);
    if (!country) {
      throw new Error(`expected a seeded country whose defaultCurrencyId is ${currency.id}`);
    }

    // --- Manual, deliberate menu assembly — never triggered automatically by the sync above ---
    const menuRes = await createMenu(trigger, {
      partnerId,
      name: `Flow Summer Menu ${Date.now().toString()}`,
      countryId: country.id,
      currencyId: currency.id,
      taxIds: [],
      applyMenuLevelTax: true,
      categories: [{ name: 'Burgers', taxIds: [] }],
    });
    const menuId = menuRes.body.menuId;
    const category = menuRes.body.categories[0];
    if (!category) {
      throw new Error('expected the just-created menu to have the one requested category');
    }

    const attachRes = await attachProducts(trigger, menuId, category.categoryId, [product.productId]);
    expect(attachRes.status).toBe(200);
    await expectProductsAttached(evidence, menuId, category.categoryId, { expectBy: '1s', timeout: '5s' });

    // --- Explicit publish — never auto-fired by anything above ---
    const publishRes = await publishMenu(trigger, menuId);
    expect(publishRes.status).toBe(202);
    expect(publishRes.body.status).toBe('PUBLISHING');
    await expectMenuPublished(evidence, menuId, { expectBy: '2s', timeout: '10s' });

    // --- The real business assertion: read the materialized view back and check the actual tax math ---
    const viewRes = await getMaterializedView(trigger, menuId);
    expect(viewRes.status).toBe(200);
    const materialized = viewRes.body.products.find((p) => p.productId === product.productId);
    if (!materialized) {
      throw new Error(`expected the materialized view for ${menuId} to include product ${product.productId}`);
    }
    // 13.00 AED at 5% VAT, exclusive, resolved at PRODUCT level — the Sync
    // workflow resolves the raw taxAssignment during dispatch and attaches
    // it directly to the product's price leg (SyncBatchProcessor.toDto()),
    // so a product created via the real import->sync pipeline always
    // carries its own tax, outranking the menu-level tax declared above.
    expect(materialized.unitPrice).toBe(1300);
    expect(materialized.taxAmount).toBe(65);
    expect(materialized.priceInclTax).toBe(1365);
    expect(materialized.taxSourceLevel).toBe('PRODUCT');
  },
});
