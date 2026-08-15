/**
 * Typed wrapper around publishing-service's evidence and its one read
 * endpoint — publishing-service is never triggered directly by a flow in
 * this suite (menu-service's publish trigger calls it internally), only
 * observed and read back from.
 */
import {
  defineServiceClientFixture,
  type Evidence,
  type Trigger,
  type WaitForOptions,
} from 'evident';

export interface AppliedTaxBody {
  taxId: string;
  name: string;
  percentage: number;
}

export interface MaterializedProductBody {
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  taxAmount: number;
  priceInclTax: number;
  appliedTaxes: AppliedTaxBody[];
  taxSourceLevel: 'PRODUCT' | 'CATEGORY' | 'MENU' | 'NONE';
}

export interface MaterializedViewBody {
  menuId: string;
  name: string;
  products: MaterializedProductBody[];
  publishedAt: string;
}

export function getMaterializedView(trigger: Trigger, menuId: string) {
  return trigger.api<MaterializedViewBody>('publishing-service', {
    method: 'GET',
    path: `/materialized-views/${menuId}`,
  });
}

type Opts = Pick<WaitForOptions, 'delay' | 'expectBy' | 'timeout' | 'expectedMatches'>;

/**
 * `menu.published` — recurs every time the same menu is republished, so
 * it's only ever safe to assert with the default `expectedMatches: 1`
 * within a single Flow *run*'s own fire-offset window (every service call
 * inside one `run()` shares that same window — see
 * flows/README.md's "what this surfaced"). A Flow that publishes the same
 * menu twice in one run must pass `expectedMatches: 'any'` for the second
 * check, or (better) be split into two separate Flows so each gets its
 * own fresh window — the approach `stale-menu-requires-explicit-republish.flow.ts` takes.
 */
export function expectMenuPublished(evidence: Evidence, menuId: string, options: Opts = {}) {
  return evidence.logs('publishing-service').waitFor(`published ${menuId}`, {
    matchOn: [
      { field: 'menuId', value: menuId },
      { field: 'event', value: 'menu.published' },
    ],
    ...options,
  });
}

/** `menu.validation_failed` — Phase 1 rejected the menu; Phase 2 (materialize) never ran, so `menu.published` must never fire for this menuId. */
export function expectValidationFailed(evidence: Evidence, menuId: string, options: Opts = {}) {
  return evidence.logs('publishing-service').waitFor(`validation failed for ${menuId}`, {
    matchOn: [
      { field: 'menuId', value: menuId },
      { field: 'event', value: 'menu.validation_failed' },
    ],
    ...options,
  });
}

export interface PublishingServiceClient {
  getMaterializedView: (menuId: string) => ReturnType<typeof getMaterializedView>;
  expectMenuPublished: (menuId: string, options?: Opts) => ReturnType<typeof expectMenuPublished>;
  expectValidationFailed: (menuId: string, options?: Opts) => ReturnType<typeof expectValidationFailed>;
}

/** Binds this file's plain functions to one Flow's own `trigger`/`evidence` — see `bulkImportClientFixture`'s doc comment for the pattern this follows. */
export const publishingServiceClientFixture = defineServiceClientFixture<
  'publishing',
  PublishingServiceClient
>('publishing', ({ trigger, evidence }: { trigger: Trigger; evidence: Evidence }) => ({
  getMaterializedView: (menuId) => getMaterializedView(trigger, menuId),
  expectMenuPublished: (menuId, options) => expectMenuPublished(evidence, menuId, options),
  expectValidationFailed: (menuId, options) => expectValidationFailed(evidence, menuId, options),
}));
