import { afterAll, afterEach, beforeAll, beforeEach, configureSuite, defineFixture, defineFlow, expect } from 'evident';
import { expectItemImported, expectSyncCompleted, expectSyncDispatched, importProducts, syncProducts } from './clients/bulk-import-service.ts';
import {
  attachProducts,
  createMenu,
  expectMenuUpdatesAvailable,
  expectProductSaved,
  expectProductsAttached,
  listCountries,
  listCurrencies,
  listProducts,
  publishMenu,
} from './clients/menu-service.ts';
import { expectMenuPublished, getMaterializedView } from './clients/publishing-service.ts';

/**
 * Two Flows, serial mode: a product update must flag a PUBLISHED menu
 * UPDATES_AVAILABLE without ever auto-republishing it — the materialized
 * view has to keep reflecting the OLD price until someone explicitly
 * republishes. Split into two Flows rather than one long one because that
 * split is what makes the "did NOT auto-republish" check actually sound
 * given how this framework's fire-offset windowing really works: within
 * one Flow `run()`, every `trigger.api()` call shares the SAME
 * fire-offset snapshot (taken before the *first* call, not re-taken per
 * call — see `createTrigger` in framework/src/evidence/trigger.ts). If
 * both publishes happened inside one Flow, a `menu.published` search with
 * the default `expectedMatches: 1` would see BOTH occurrences in that one
 * shared window and throw `DuplicateMatchError` on the second check — not
 * because anything is wrong, just because the mechanism doesn't
 * distinguish "occurrence #2 of an intentional double-publish" from "a
 * genuine unexpected duplicate." A separate Flow gets a genuinely fresh
 * window (a new `runFlow()` call, a new fireOffsets snapshot) starting
 * *after* the first publish already happened — exactly the case
 * architecture.md §5 describes: keeping a stale match from a previous run
 * against the same append-only log file from ever matching.
 *
 * A second, easy-to-miss real behavior this file's order depends on:
 * running this file with no `--name` executes every exported Flow via
 * `collectFlows()` (`cli-support.ts`), which walks
 * `Object.entries(moduleExports)` — and a JS module namespace object's
 * own [[OwnPropertyKeys]] enumerates its *string* export names in
 * ascending alphabetical order, per the ECMAScript spec, regardless of
 * the order they're declared/exported in the source file. "Sequential
 * (declared order) is the default" (`suite-context.ts`'s own doc comment)
 * is therefore only true when export names already happen to sort
 * alphabetically in the intended order — it is *not* true in general.
 * The two export names below are deliberately chosen so
 * `publishEstablishesTheMaterializedView` sorts before
 * `staleMenuIsFlaggedThenExplicitlyRepublished` — confirmed by actually
 * running this file: the original names picked here on the first pass
 * sorted the other way and silently ran Flow B first, failing on a
 * missing fixture value instead of the intended scenario.
 *
 * Also demonstrates: Suite hooks (`beforeAll`/`afterAll`/`beforeEach`/
 * `afterEach`), a Flow-scoped Fixture that `deps` on the Suite-scoped one
 * (`flowRunLogFixture`), and an `auto: true` Fixture (`flowStartMarkerFixture`).
 *
 * A third real finding, alongside the two above: `auto: true` is
 * currently inert. Read `fixture.ts`/`fixture-resolver.ts`/`run-flow.ts`/
 * `run-suite.ts` in full looking for whatever reads that field to
 * auto-inject the Fixture — nothing does. A Fixture with `auto: true`
 * still has to be listed explicitly in a Flow's own `fixtures: [...]`
 * array to run at all, exactly like any other Fixture; the field is
 * currently just documented intent (flow-model.md §9.4), not wired up in
 * the runner. The earlier flow set's `lifecycle.flow.ts` already did this
 * (both its Flows explicitly listed `noUnexpectedErrorsFixture` despite
 * its `auto: true`) — easy to miss since it still reads naturally as "the
 * automatic one." `flowStartMarkerFixture` below is listed explicitly in
 * both Flows for exactly this reason.
 */
configureSuite({ mode: 'serial' });

beforeAll(() => {
  console.log('stale-menu suite starting');
});

afterAll(() => {
  console.log('stale-menu suite finished');
});

beforeEach(() => {
  console.log('stale-menu flow starting');
});

afterEach(() => {
  console.log('stale-menu flow finished');
});

interface SharedCatalogState {
  partnerId: string;
  externalId: string;
  productId?: string;
  menuId?: string;
  categoryId?: string;
  runLog: string[];
}

/**
 * Suite-scoped, holding one nested object (`shared`) both Flows mutate in
 * place. Deliberately NOT top-level fixture properties reassigned from
 * inside a Flow's `run()` — `FixtureResolver.resolveForFlow()`
 * (framework/src/flow/fixture-resolver.ts) rebuilds the merged fixtures
 * object fresh for every Flow via `{...target, ...value}`, so
 * `fixtures.menuId = x` inside one Flow would only mutate that Flow's own
 * throwaway shallow copy and never be seen by the next Flow. A *nested*
 * object survives that shallow copy by reference — the same reason
 * lifecycle.flow.ts's `batch.recordIds.push(...)` array mutation works —
 * so state meant to cross a Flow boundary within a Suite has to live one
 * level down like this, not as a top-level fixture field.
 */
const catalogStateFixture = defineFixture<{ shared: SharedCatalogState }>({
  scope: 'suite',
  async setup(_deps, { use }) {
    await use({
      shared: {
        partnerId: 'flow-partner-stale-menu',
        externalId: `stale-menu-${Date.now().toString()}`,
        runLog: [],
      },
    });
  },
});

/**
 * Flow-scoped (resolved fresh per Flow, unlike catalogStateFixture's one
 * Suite-wide instance) but `deps` on that Suite-scoped Fixture — its
 * `setup` receives catalogStateFixture's actual resolved value (not a
 * copy; see `FixtureResolver.resolveOne`, which only shallow-copies at
 * the *top-level merge into `run()`'s `fixtures` param*, not when handing
 * a value to a dependent Fixture's own `setup`), so pushing onto
 * `dep.shared.runLog` here is visible to both Flows and to `run()` itself.
 */
const flowRunLogFixture = defineFixture<void, { shared: SharedCatalogState }>({
  scope: 'flow',
  deps: catalogStateFixture,
  async setup(dep, { use }) {
    dep.shared.runLog.push(new Date().toISOString());
    await use(undefined);
  },
});

/**
 * `auto: true` — see this file's top doc comment for why it's still
 * listed explicitly in both Flows' `fixtures:` below despite that.
 */
const flowStartMarkerFixture = defineFixture<void>({
  scope: 'flow',
  auto: true,
  async setup(_deps, { use }) {
    console.log('[flowStartMarkerFixture] ran for this Flow');
    await use(undefined);
  },
});

function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

/**
 * Flow A — establishes a real published menu. Kept minimal since the
 * interesting assertions all live in Flow B; this is essentially a
 * smaller repeat of catalog-sync-pipeline.flow.ts's happy path, needed
 * here so there's a genuinely PUBLISHED menu (with a known first price)
 * for Flow B to update against.
 */
export const publishEstablishesTheMaterializedView = defineFlow({
  name: 'stale-menu-initial-publish',
  services: ['bulk-import-service', 'menu-service', 'publishing-service'],
  safety: 'safe',
  correlation: 'heuristic',
  fixtures: [catalogStateFixture, flowRunLogFixture, flowStartMarkerFixture],
  async run({ trigger, evidence, fixtures }) {
    const { shared } = fixtures;

    const importRes = await importProducts(trigger, shared.partnerId, [
      {
        externalId: shared.externalId,
        sku: 'SKU-FLOW-STALE',
        name: 'Flow Stale-Test Item',
        price: 10.0,
        currencyCode: 'AED',
        taxAssignment: { name: 'UAE VAT', percentage: 5.0 },
      },
    ]);
    await expectItemImported(evidence, importRes.body.requestId, shared.externalId, { expectBy: '1s', timeout: '5s' });

    const syncRes = await syncProducts(trigger, shared.partnerId, [shared.externalId]);
    await expectSyncDispatched(evidence, syncRes.body.syncId, shared.externalId, { expectBy: '2s', timeout: '10s' });
    await expectProductSaved(evidence, shared.externalId, 'CREATE', { expectBy: '2s', timeout: '10s' });
    await expectSyncCompleted(evidence, syncRes.body.syncId, shared.externalId, { expectBy: '2s', timeout: '10s' });

    const productsRes = await listProducts(trigger, 'ACTIVE');
    const product = requireDefined(
      productsRes.body.find((p) => p.externalId === shared.externalId),
      `expected menu-service to have created a product for externalId=${shared.externalId}`,
    );
    shared.productId = product.productId;

    const currenciesRes = await listCurrencies(trigger, 'AED');
    const currency = requireDefined(currenciesRes.body[0], 'expected menu-service to have a seeded AED currency');
    const countriesRes = await listCountries(trigger);
    const country = requireDefined(
      countriesRes.body.find((c) => c.defaultCurrencyId === currency.id),
      `expected a seeded country whose defaultCurrencyId is ${currency.id}`,
    );

    const menuRes = await createMenu(trigger, {
      partnerId: shared.partnerId,
      name: `Flow Stale Menu ${Date.now().toString()}`,
      countryId: country.id,
      currencyId: currency.id,
      taxIds: [],
      applyMenuLevelTax: true,
      categories: [{ name: 'Burgers', taxIds: [] }],
    });
    shared.menuId = menuRes.body.menuId;
    const category = requireDefined(menuRes.body.categories[0], 'expected the just-created menu to have the one requested category');
    shared.categoryId = category.categoryId;

    await attachProducts(trigger, shared.menuId, shared.categoryId, [shared.productId]);
    await expectProductsAttached(evidence, shared.menuId, shared.categoryId, { expectBy: '1s', timeout: '5s' });

    const publishRes = await publishMenu(trigger, shared.menuId);
    expect(publishRes.body.status).toBe('PUBLISHING');
    await expectMenuPublished(evidence, shared.menuId, { expectBy: '2s', timeout: '10s' });

    const viewRes = await getMaterializedView(trigger, shared.menuId);
    const materialized = requireDefined(
      viewRes.body.products.find((p) => p.productId === shared.productId),
      `expected the materialized view for ${shared.menuId} to include product ${shared.productId}`,
    );
    expect(materialized.unitPrice).toBe(1000); // 10.00 AED
  },
});

/**
 * Flow B — the actual scenario under test. Runs in its own fresh
 * fire-offset window (a separate `runFlow()` call), which is exactly what
 * makes "no auto-republish happened" a genuine, soundly-provable negative
 * here, and later makes "exactly one new menu.published" a soundly
 * provable positive — Flow A's earlier publish lives in a different run's
 * window and can never leak into either check.
 */
export const staleMenuIsFlaggedThenExplicitlyRepublished = defineFlow({
  name: 'stale-menu-flagged-then-explicitly-republished',
  services: ['bulk-import-service', 'menu-service', 'publishing-service'],
  safety: 'safe',
  correlation: 'heuristic',
  fixtures: [catalogStateFixture, flowRunLogFixture, flowStartMarkerFixture],
  async run({ trigger, evidence, fixtures }) {
    const { shared } = fixtures;
    const menuId = requireDefined(shared.menuId, 'expected publishEstablishesTheMaterializedView to have run first (serial Suite mode)');
    const productId = requireDefined(shared.productId, 'expected publishEstablishesTheMaterializedView to have run first (serial Suite mode)');

    // flowRunLogFixture ran once for this Flow and once for the earlier
    // one — proof the dependent-Fixture mutation actually crossed the
    // Flow boundary, not just menuId/productId/etc.
    expect(shared.runLog.length).toBeGreaterThanOrEqual(2);

    // Re-import with a changed price -> UPDATED -> already SELECTED -> Sync auto-triggers.
    const reImportRes = await importProducts(trigger, shared.partnerId, [
      {
        externalId: shared.externalId,
        sku: 'SKU-FLOW-STALE',
        name: 'Flow Stale-Test Item',
        price: 15.0,
        currencyCode: 'AED',
        taxAssignment: { name: 'UAE VAT', percentage: 5.0 },
      },
    ]);
    expect(reImportRes.body.summary.updated).toBe(1);
    expect(reImportRes.body.autoSyncTriggered).toContain(shared.externalId);

    await expectProductSaved(evidence, shared.externalId, 'UPDATE', { expectBy: '2s', timeout: '10s' });
    await expectMenuUpdatesAvailable(evidence, menuId, { expectBy: '2s', timeout: '10s' });

    // The negative: no auto-republish in reaction to the update.
    const republishedAutomatically = await evidence.logs('publishing-service').contains('published', {
      matchOn: [
        { field: 'menuId', value: menuId },
        { field: 'event', value: 'menu.published' },
      ],
    });
    expect(republishedAutomatically).toBe(false);

    const staleViewRes = await getMaterializedView(trigger, menuId);
    const staleMaterialized = requireDefined(
      staleViewRes.body.products.find((p) => p.productId === productId),
      `expected the materialized view for ${menuId} to still include product ${productId}`,
    );
    expect(staleMaterialized.unitPrice).toBe(1000); // still the OLD price — materialize hasn't re-run

    // Now the explicit, deliberate republish.
    const republishRes = await publishMenu(trigger, menuId);
    expect(republishRes.body.status).toBe('PUBLISHING');
    await expectMenuPublished(evidence, menuId, { expectBy: '2s', timeout: '10s' }); // exactly 1 within THIS run's own window

    const freshViewRes = await getMaterializedView(trigger, menuId);
    const freshMaterialized = requireDefined(
      freshViewRes.body.products.find((p) => p.productId === productId),
      `expected the materialized view for ${menuId} to include product ${productId} after republishing`,
    );
    expect(freshMaterialized.unitPrice).toBe(1500); // 15.00 AED — the NEW price
    expect(freshMaterialized.taxAmount).toBe(75); // 5% of 1500
  },
});
