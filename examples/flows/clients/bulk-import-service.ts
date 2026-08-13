/**
 * Typed wrapper around bulk-import-service's endpoints and evidence — the
 * raw path/method/body/matchOn shape lives here once instead of repeated
 * across every flow that imports or syncs a product.
 */
import type { Evidence, Trigger, WaitForOptions } from 'evident';

export interface TaxAssignment {
  name: string;
  percentage: number;
}

export interface ImportItem {
  externalId: string;
  sku: string;
  name: string;
  price: number;
  currencyCode: string;
  taxAssignment: TaxAssignment;
}

export interface ImportSummary {
  new: number;
  updated: number;
  unchanged: number;
}

export interface ImportResponseBody {
  requestId: string;
  itemCount: number;
  summary: ImportSummary;
  autoSyncTriggered: string[];
}

export function importProducts(trigger: Trigger, partnerId: string, items: ImportItem[]) {
  return trigger.api<ImportResponseBody>('bulk-import-service', {
    method: 'POST',
    path: '/imports',
    body: { partnerId, items },
  });
}

export interface SyncResponseBody {
  syncId: string;
  selectedCount: number;
}

export function syncProducts(trigger: Trigger, partnerId: string, externalIds: string[]) {
  return trigger.api<SyncResponseBody>('bulk-import-service', {
    method: 'POST',
    path: '/sync',
    body: { partnerId, externalIds },
  });
}

export interface ImportedProductBody {
  partnerId: string;
  externalId: string;
  selectionStatus: 'NOT_SELECTED' | 'SELECTED';
  lastImportOutcome: 'NEW' | 'UPDATED' | 'UNCHANGED';
  contentHash: string;
  version: number;
}

export function getImportedProduct(trigger: Trigger, partnerId: string, externalId: string) {
  return trigger.api<ImportedProductBody>('bulk-import-service', {
    method: 'GET',
    path: `/imports/products/${externalId}?partnerId=${encodeURIComponent(partnerId)}`,
  });
}

type Opts = Pick<WaitForOptions, 'delay' | 'expectBy' | 'timeout'>;

/** `item.imported` — one per item, requestId+externalId is unique within a single import call. */
export function expectItemImported(evidence: Evidence, requestId: string, externalId: string, options: Opts) {
  return evidence.logs('bulk-import-service').waitFor(`imported ${externalId}`, {
    matchOn: [
      { field: 'requestId', value: requestId },
      { field: 'externalId', value: externalId },
      { field: 'event', value: 'item.imported' },
    ],
    ...options,
  });
}

/** `item.sync.dispatched` — fires once per item that actually needed a call to menu-service. */
export function expectSyncDispatched(evidence: Evidence, syncId: string, externalId: string, options: Opts) {
  return evidence.logs('bulk-import-service').waitFor(`dispatched ${externalId}`, {
    matchOn: [
      { field: 'syncId', value: syncId },
      { field: 'externalId', value: externalId },
      { field: 'event', value: 'item.sync.dispatched' },
    ],
    ...options,
  });
}

/**
 * `item.sync.skipped` — the no-op path: content unchanged since the last
 * successful sync, so nothing was ever sent to menu-service for this item.
 */
export function expectSyncSkipped(evidence: Evidence, syncId: string, externalId: string, options: Opts) {
  return evidence.logs('bulk-import-service').waitFor(`sync skipped for ${externalId}`, {
    matchOn: [
      { field: 'syncId', value: syncId },
      { field: 'externalId', value: externalId },
      { field: 'event', value: 'item.sync.skipped' },
    ],
    ...options,
  });
}

/** `item.sync.completed` — the callback from menu-service closing the loop, real productId now known. */
export function expectSyncCompleted(evidence: Evidence, syncId: string, externalId: string, options: Opts) {
  return evidence.logs('bulk-import-service').waitFor(`sync completed for ${externalId}`, {
    matchOn: [
      { field: 'syncId', value: syncId },
      { field: 'externalId', value: externalId },
      { field: 'event', value: 'item.sync.completed' },
    ],
    ...options,
  });
}
