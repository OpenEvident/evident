import { defineFlow, expect, extractString, findItem, requireDefined } from 'evident';
import { bulkImportClientFixture } from './clients/bulk-import-service.ts';
import { menuServiceClientFixture } from './clients/menu-service.ts';
import { publishingServiceClientFixture } from './clients/publishing-service.ts';

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
 * GET endpoint already exposes directly. The real productId, though, comes
 * from neither — `extractString(productSaved.record, 'productId')` reads
 * it straight off `product.saved`'s matched log record, rather than a
 * separate `listProducts` call whose only job would be re-finding the row
 * this flow already has evidence for.
 *
 * All three services are bound via the Fixture-as-service-client pattern
 * (`defineServiceClientFixture`, flow-model.md §5) — `fixtures.bulkImport`/
 * `menuService`/`publishing`'s methods are already bound to this Flow's own
 * `trigger`/`evidence`, so call sites don't repeat either.
 */
export default defineFlow({
  name: 'catalog-sync-pipeline',
  services: ['bulk-import-service', 'menu-service', 'publishing-service'],
  safety: 'safe',
  correlation: 'heuristic',
  fixtures: [bulkImportClientFixture, menuServiceClientFixture, publishingServiceClientFixture],
  async run({ fixtures: { bulkImport, menuService, publishing } }) {
    const partnerId = 'flow-partner-catalog-pipeline';
    const externalId = `catalog-pipeline-${Date.now()}`;

    // --- Import: raw partner data, no real IDs yet ---
    const importRes = await bulkImport.importProducts(partnerId, [
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
    await bulkImport.expectItemImported(importRes.body.requestId, externalId, {
      expectBy: '1s',
      timeout: '5s',
    });

    // --- Sync: resolve currency/tax against menu-service, dispatch, close the loop via callback ---
    const syncRes = await bulkImport.syncProducts(partnerId, [externalId]);
    expect(syncRes.status).toBe(202);
    expect(syncRes.body.selectedCount).toBe(1);

    // No expectBy/timeout here — evident.config.ts's defaultPollOptions
    // ({ expectBy: '2s', timeout: '10s' }) already matches this tier.
    await bulkImport.expectSyncDispatched(syncRes.body.syncId, externalId);

    const productSaved = await menuService.expectProductSaved(externalId, 'CREATE');
    const productId = extractString(productSaved.record, 'productId');

    await bulkImport.expectSyncCompleted(syncRes.body.syncId, externalId);

    // --- Reference data — genuinely not something any log line emits, still a real REST read ---
    const currenciesRes = await menuService.listCurrencies('AED');
    const currency = requireDefined(currenciesRes.body[0], 'expected menu-service to have a seeded AED currency');
    const countriesRes = await menuService.listCountries();
    const country = findItem(
      countriesRes.body,
      (c) => c.defaultCurrencyId === currency.id,
      `expected a seeded country whose defaultCurrencyId is ${currency.id}`,
    );

    // --- Manual, deliberate menu assembly — never triggered automatically by the sync above ---
    const menuRes = await menuService.createMenu({
      partnerId,
      name: `Flow Summer Menu ${Date.now().toString()}`,
      countryId: country.id,
      currencyId: currency.id,
      taxIds: [],
      applyMenuLevelTax: true,
      categories: [{ name: 'Burgers', taxIds: [] }],
    });
    const menuId = menuRes.body.menuId;
    const category = requireDefined(
      menuRes.body.categories[0],
      'expected the just-created menu to have the one requested category',
    );

    const attachRes = await menuService.attachProducts(menuId, category.categoryId, [productId]);
    expect(attachRes.status).toBe(200);
    await menuService.expectProductsAttached(menuId, category.categoryId, {
      expectBy: '1s',
      timeout: '5s',
    });

    // --- Explicit publish — never auto-fired by anything above ---
    const publishRes = await menuService.publishMenu(menuId);
    expect(publishRes.status).toBe(202);
    expect(publishRes.body.status).toBe('PUBLISHING');
    await publishing.expectMenuPublished(menuId);

    // --- The real business assertion: read the materialized view back and check the actual tax math ---
    const viewRes = await publishing.getMaterializedView(menuId);
    expect(viewRes.status).toBe(200);
    const materialized = findItem(
      viewRes.body.products,
      (p) => p.productId === productId,
      `expected the materialized view for ${menuId} to include product ${productId}`,
    );
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
