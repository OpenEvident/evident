import { defineFlow, expect, findItem, requireDefined, type Evidence, type Trigger } from 'evident';
import { importProducts, syncProducts, expectSyncCompleted, expectSyncDispatched, expectItemImported } from './clients/bulk-import-service.ts';
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
import { expectMenuPublished, expectValidationFailed } from './clients/publishing-service.ts';

async function importSyncAndAssembleOneProductMenu(
  trigger: Trigger,
  evidence: Evidence,
  partnerId: string,
  externalId: string,
  countryCode: 'AE' | 'US',
) {
  const importRes = await importProducts(trigger, partnerId, [
    { externalId, sku: 'SKU-FLOW-VALIDATE', name: 'Flow Validation Item', price: 8.0, currencyCode: 'AED', taxAssignment: { name: 'UAE VAT', percentage: 5.0 } },
  ]);
  await expectItemImported(evidence, importRes.body.requestId, externalId, { expectBy: '1s', timeout: '5s' });

  const syncRes = await syncProducts(trigger, partnerId, [externalId]);
  await expectSyncDispatched(evidence, syncRes.body.syncId, externalId, { expectBy: '2s', timeout: '10s' });
  await expectProductSaved(evidence, externalId, 'CREATE', { expectBy: '2s', timeout: '10s' });
  await expectSyncCompleted(evidence, syncRes.body.syncId, externalId, { expectBy: '2s', timeout: '10s' });

  const productsRes = await listProducts(trigger, 'ACTIVE');
  const product = findItem(productsRes.body, (p) => p.externalId === externalId, `expected a product for externalId=${externalId}`);

  const countriesRes = await listCountries(trigger);
  const country = findItem(countriesRes.body, (c) => c.code === countryCode, `expected a seeded country with code=${countryCode}`);

  return { product, country };
}

/**
 * `safety: 'ask-first'` gating (Decision 15): `evident run` refuses to
 * execute this Flow at all unless `--confirm` is passed, since there's no
 * LLM inside the CLI to make that judgment call itself. Publishing a menu
 * is a genuinely real, deliberate write here (materializes a real
 * document, flips the menu's real status) — a better fit for this
 * mechanism than an arbitrary demo action, though still just an internal
 * write in this example suite rather than a real external side effect
 * (a real webhook, a real charge) the mechanism is ultimately meant for.
 */
export const explicitPublishRequiresConfirmation = defineFlow({
  name: 'publish-ask-first-safety',
  services: ['bulk-import-service', 'menu-service', 'publishing-service'],
  safety: 'ask-first',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const partnerId = 'flow-partner-ask-first';
    const externalId = `ask-first-${Date.now().toString()}`;

    const { product, country } = await importSyncAndAssembleOneProductMenu(trigger, evidence, partnerId, externalId, 'AE');
    const currenciesRes = await listCurrencies(trigger, 'AED');
    const currency = requireDefined(currenciesRes.body[0], 'expected a seeded AED currency');

    const menuRes = await createMenu(trigger, {
      partnerId,
      name: `Flow Ask-First Menu ${Date.now().toString()}`,
      countryId: country.id,
      currencyId: currency.id,
      taxIds: [],
      applyMenuLevelTax: true,
      categories: [{ name: 'Items', taxIds: [] }],
    });
    const category = requireDefined(menuRes.body.categories[0], 'expected the requested category');
    await attachProducts(trigger, menuRes.body.menuId, category.categoryId, [product.productId]);
    await expectProductsAttached(evidence, menuRes.body.menuId, category.categoryId, { expectBy: '1s', timeout: '5s' });

    const publishRes = await publishMenu(trigger, menuRes.body.menuId);
    expect(publishRes.status).toBe(202);
    await expectMenuPublished(evidence, menuRes.body.menuId, { expectBy: '2s', timeout: '10s' });
  },
});

/**
 * A validation failure is a real, distinct outcome from a trigger
 * failure: `POST /menus/{id}/publish` itself still returns 202 (the
 * *trigger* succeeded — menu-service accepted the request and handed it
 * to publishing-service), but the actual business outcome fails
 * asynchronously, observable only via evidence, never via the trigger's
 * own response. Reproduced here with a real, deterministic mismatch — a
 * product priced only in AED attached to a menu created with USD as its
 * currency, so Phase 1 validation's currency-leg-exists check genuinely
 * fails, no white-box trickery involved.
 */
export const invalidMenuFailsValidationWithoutATriggerError = defineFlow({
  name: 'publish-validation-failure-not-a-trigger-failure',
  services: ['bulk-import-service', 'menu-service', 'publishing-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const partnerId = 'flow-partner-validation-failure';
    const externalId = `validation-failure-${Date.now().toString()}`;

    const { product, country } = await importSyncAndAssembleOneProductMenu(trigger, evidence, partnerId, externalId, 'AE');
    const usdRes = await listCurrencies(trigger, 'USD');
    const usd = requireDefined(usdRes.body[0], 'expected a seeded USD currency');

    // Deliberately mismatched: the product only has an AED price leg, the menu is priced in USD.
    const menuRes = await createMenu(trigger, {
      partnerId,
      name: `Flow Broken Menu ${Date.now().toString()}`,
      countryId: country.id,
      currencyId: usd.id,
      taxIds: [],
      applyMenuLevelTax: false,
      categories: [{ name: 'Items', taxIds: [] }],
    });
    const category = requireDefined(menuRes.body.categories[0], 'expected the requested category');
    await attachProducts(trigger, menuRes.body.menuId, category.categoryId, [product.productId]);
    await expectProductsAttached(evidence, menuRes.body.menuId, category.categoryId, { expectBy: '1s', timeout: '5s' });

    const publishRes = await publishMenu(trigger, menuRes.body.menuId);
    expect(publishRes.status).toBe(202); // the trigger call itself is accepted — it doesn't know yet that it'll fail
    expect(publishRes.body.status).toBe('PUBLISHING');

    await expectValidationFailed(evidence, menuRes.body.menuId, { expectBy: '2s', timeout: '10s' });

    const publishedAnyway = await evidence.logs('publishing-service').contains('published', {
      matchOn: [
        { field: 'menuId', value: menuRes.body.menuId },
        { field: 'event', value: 'menu.published' },
      ],
    });
    expect(publishedAnyway).toBe(false);
  },
});

/**
 * The other side of the same distinction: a malformed request that fails
 * *before* menu-service or publishing-service ever get involved — `POST
 * /imports` with an empty `items` array violates `@NotEmpty`, so
 * bulk-import-service rejects it with a real 400. `trigger.api()` throws
 * `TriggerError` on any non-2xx response; deliberately no try/catch and
 * no assertion below, matching the framework's own established
 * `triggerFailure` precedent exactly — letting the throw propagate
 * unhandled is what lets `runFlow()` categorize this as a trigger
 * failure (a `TriggerError` in `triggers[]`, Decision 19) rather than the
 * Flow author catching and checking it manually.
 */
export const malformedImportRequestIsARealTriggerFailure = defineFlow({
  name: 'import-malformed-request-trigger-failure',
  services: ['bulk-import-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger }) {
    await importProducts(trigger, 'flow-partner-malformed', []);
  },
});
