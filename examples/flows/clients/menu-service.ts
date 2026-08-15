/**
 * Typed wrapper around menu-service's endpoints and evidence. Covers
 * reference-data reads (needed to build a real menu with real IDs),
 * Product/Menu CRUD, the manual assembly action, the explicit publish
 * trigger, and the bulk dispatch endpoint bulk-import-service normally
 * calls — exposed here too since a flow can call it directly to exercise
 * menu-service's restart-resilient batch processing in isolation.
 */
import {
  defineServiceClientFixture,
  type Evidence,
  type Trigger,
  type WaitForOptions,
} from 'evident';

export interface CurrencyBody {
  id: string;
  code: string;
  name: string;
  precision: number;
  status: string;
}

export function listCurrencies(trigger: Trigger, code?: string) {
  const query = code ? `?code=${encodeURIComponent(code)}` : '';
  return trigger.api<CurrencyBody[]>('menu-service', { method: 'GET', path: `/currencies${query}` });
}

export interface CountryBody {
  id: string;
  code: string;
  name: string;
  defaultCurrencyId: string;
  status: string;
}

export function listCountries(trigger: Trigger) {
  return trigger.api<CountryBody[]>('menu-service', { method: 'GET', path: '/countries' });
}

export interface TaxBody {
  id: string;
  name: string;
  percentage: number;
  countryId: string | null;
  status: string;
  version: number;
}

export function listTaxes(trigger: Trigger, name?: string, percentage?: number) {
  const params = new URLSearchParams();
  if (name) params.set('name', name);
  if (percentage !== undefined) params.set('percentage', percentage.toString());
  const query = params.size > 0 ? `?${params.toString()}` : '';
  return trigger.api<TaxBody[]>('menu-service', { method: 'GET', path: `/taxes${query}` });
}

export interface ProductPriceBody {
  currencyId: string;
  amount: number;
  taxInclusive: boolean;
  taxIds: string[];
}

export interface ProductBody {
  productId: string;
  externalId: string;
  sku: string;
  name: string;
  prices: ProductPriceBody[];
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
}

export function listProducts(trigger: Trigger, status?: 'ACTIVE' | 'INACTIVE') {
  const query = status ? `?status=${status}` : '';
  return trigger.api<ProductBody[]>('menu-service', { method: 'GET', path: `/products${query}` });
}

export interface CategoryBody {
  categoryId: string;
  name: string;
  taxIds: string[];
  productIds: string[];
}

export interface MenuBody {
  menuId: string;
  partnerId: string;
  name: string;
  countryId: string;
  currencyId: string;
  taxIds: string[];
  applyMenuLevelTax: boolean;
  categories: CategoryBody[];
  status: 'DRAFT' | 'UPDATES_AVAILABLE' | 'PUBLISHING' | 'PUBLISHED' | 'VALIDATION_FAILED' | 'DELETED';
  version: number;
}

export interface CreateMenuRequest {
  partnerId: string;
  name: string;
  countryId: string;
  currencyId: string;
  taxIds: string[];
  applyMenuLevelTax: boolean;
  categories: { name: string; taxIds: string[] }[];
}

export function createMenu(trigger: Trigger, body: CreateMenuRequest) {
  return trigger.api<MenuBody>('menu-service', { method: 'POST', path: '/menus', body });
}

export function attachProducts(trigger: Trigger, menuId: string, categoryId: string, productIds: string[]) {
  return trigger.api<MenuBody>('menu-service', {
    method: 'POST',
    path: `/menus/${menuId}/categories/${categoryId}/products`,
    body: { productIds },
  });
}

export interface PublishTriggerBody {
  menuId: string;
  status: string;
}

export function publishMenu(trigger: Trigger, menuId: string) {
  return trigger.api<PublishTriggerBody>('menu-service', { method: 'POST', path: `/menus/${menuId}/publish` });
}

export function getMenu(trigger: Trigger, menuId: string) {
  return trigger.api<MenuBody>('menu-service', { method: 'GET', path: `/menus/${menuId}` });
}

export interface BulkProductItem {
  externalId: string;
  action: 'CREATE' | 'UPDATE';
  sku: string;
  name: string;
  prices: ProductPriceBody[];
}

export interface BulkDispatchBody {
  batchId: string;
  jobCount: number;
}

/**
 * The endpoint bulk-import-service's Sync workflow normally calls —
 * exposed here so a flow can exercise menu-service's restart-resilient
 * batch processing directly, with pre-resolved IDs, independent of the
 * Sync workflow's own resolve/hash-check steps.
 *
 * `simulateItemDelayMs` is a real, testing-only knob on the request DTO
 * (`BulkProductRequestDto`), not a flow-side fake — sleeps that long per
 * item inside `ProductBulkBatchProcessor` before saving it, the same
 * established pattern `receiver-service`'s own `delayMs` field used.
 */
export function dispatchProductsBulk(
  trigger: Trigger,
  partnerId: string,
  syncId: string,
  items: BulkProductItem[],
  simulateItemDelayMs?: number,
) {
  return trigger.api<BulkDispatchBody>('menu-service', {
    method: 'POST',
    path: '/products/bulk',
    body: { partnerId, syncId, items, simulateItemDelayMs: simulateItemDelayMs ?? null },
  });
}

export interface BulkStatusBody {
  batchId: string;
  total: number;
  completed: number;
  failed: number;
  status: 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_COMPLETED';
}

export function getBulkStatus(trigger: Trigger, batchId: string) {
  return trigger.api<BulkStatusBody>('menu-service', { method: 'GET', path: `/bulk/${batchId}/status` });
}

type Opts = Pick<WaitForOptions, 'delay' | 'expectBy' | 'timeout'>;

/** `product.saved` — fires on both CREATE and UPDATE; `action` disambiguates which. */
export function expectProductSaved(evidence: Evidence, externalId: string, action: 'CREATE' | 'UPDATE', options: Opts = {}) {
  return evidence.logs('menu-service').waitFor(`${action === 'CREATE' ? 'created' : 'updated'} product`, {
    matchOn: [
      { field: 'externalId', value: externalId },
      { field: 'action', value: action },
      { field: 'event', value: 'product.saved' },
    ],
    ...options,
  });
}

/** `menu.updates_available` — a PUBLISHED menu got flagged stale by a product change; never auto-republished. */
export function expectMenuUpdatesAvailable(evidence: Evidence, menuId: string, options: Opts = {}) {
  return evidence.logs('menu-service').waitFor(`menu ${menuId} flagged stale`, {
    matchOn: [
      { field: 'menuId', value: menuId },
      { field: 'event', value: 'menu.updates_available' },
    ],
    ...options,
  });
}

/** `menu.products_attached` — the manual, deliberate assembly action. */
export function expectProductsAttached(evidence: Evidence, menuId: string, categoryId: string, options: Opts = {}) {
  return evidence.logs('menu-service').waitFor(`attached`, {
    matchOn: [
      { field: 'menuId', value: menuId },
      { field: 'categoryId', value: categoryId },
      { field: 'event', value: 'menu.products_attached' },
    ],
    ...options,
  });
}

/** `batch.recovery.resumed` — only ever fires on menu-service's own startup, if a batch was left mid-flight. */
export function expectBatchRecoveryResumed(evidence: Evidence, batchId: string, options: Opts = {}) {
  return evidence.logs('menu-service').waitFor(`resuming`, {
    matchOn: [
      { field: 'batchId', value: batchId },
      { field: 'event', value: 'batch.recovery.resumed' },
    ],
    ...options,
  });
}

export interface MenuServiceClient {
  listCurrencies: (code?: string) => ReturnType<typeof listCurrencies>;
  listCountries: () => ReturnType<typeof listCountries>;
  listTaxes: (name?: string, percentage?: number) => ReturnType<typeof listTaxes>;
  listProducts: (status?: 'ACTIVE' | 'INACTIVE') => ReturnType<typeof listProducts>;
  createMenu: (body: CreateMenuRequest) => ReturnType<typeof createMenu>;
  attachProducts: (menuId: string, categoryId: string, productIds: string[]) => ReturnType<typeof attachProducts>;
  publishMenu: (menuId: string) => ReturnType<typeof publishMenu>;
  getMenu: (menuId: string) => ReturnType<typeof getMenu>;
  dispatchProductsBulk: (
    partnerId: string,
    syncId: string,
    items: BulkProductItem[],
    simulateItemDelayMs?: number,
  ) => ReturnType<typeof dispatchProductsBulk>;
  getBulkStatus: (batchId: string) => ReturnType<typeof getBulkStatus>;
  expectProductSaved: (
    externalId: string,
    action: 'CREATE' | 'UPDATE',
    options?: Opts,
  ) => ReturnType<typeof expectProductSaved>;
  expectMenuUpdatesAvailable: (menuId: string, options?: Opts) => ReturnType<typeof expectMenuUpdatesAvailable>;
  expectProductsAttached: (
    menuId: string,
    categoryId: string,
    options?: Opts,
  ) => ReturnType<typeof expectProductsAttached>;
  expectBatchRecoveryResumed: (batchId: string, options?: Opts) => ReturnType<typeof expectBatchRecoveryResumed>;
}

/** Binds this file's plain functions to one Flow's own `trigger`/`evidence` — see `bulkImportClientFixture`'s doc comment for the pattern this follows. */
export const menuServiceClientFixture = defineServiceClientFixture<'menuService', MenuServiceClient>(
  'menuService',
  ({ trigger, evidence }: { trigger: Trigger; evidence: Evidence }) => ({
    listCurrencies: (code) => listCurrencies(trigger, code),
    listCountries: () => listCountries(trigger),
    listTaxes: (name, percentage) => listTaxes(trigger, name, percentage),
    listProducts: (status) => listProducts(trigger, status),
    createMenu: (body) => createMenu(trigger, body),
    attachProducts: (menuId, categoryId, productIds) => attachProducts(trigger, menuId, categoryId, productIds),
    publishMenu: (menuId) => publishMenu(trigger, menuId),
    getMenu: (menuId) => getMenu(trigger, menuId),
    dispatchProductsBulk: (partnerId, syncId, items, simulateItemDelayMs) =>
      dispatchProductsBulk(trigger, partnerId, syncId, items, simulateItemDelayMs),
    getBulkStatus: (batchId) => getBulkStatus(trigger, batchId),
    expectProductSaved: (externalId, action, options) =>
      expectProductSaved(evidence, externalId, action, options),
    expectMenuUpdatesAvailable: (menuId, options) => expectMenuUpdatesAvailable(evidence, menuId, options),
    expectProductsAttached: (menuId, categoryId, options) =>
      expectProductsAttached(evidence, menuId, categoryId, options),
    expectBatchRecoveryResumed: (batchId, options) => expectBatchRecoveryResumed(evidence, batchId, options),
  }),
);
