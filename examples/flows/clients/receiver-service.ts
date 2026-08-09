/**
 * Typed wrapper around receiver-service's evidence — this service is never
 * triggered directly (caller-service calls it internally), only observed.
 * `expectProcessed` wraps the repeated "processed record {id}" log
 * assertion so its message format and matchOn shape live in one place.
 */
import type { Evidence, WaitForOptions } from 'evident';

export function expectProcessed(
  evidence: Evidence,
  recordId: string,
  options: Pick<WaitForOptions, 'delay' | 'expectBy' | 'timeout'>,
) {
  return evidence.logs('receiver-service').waitFor(`processed record ${recordId}`, {
    matchOn: 'recordId',
    value: recordId,
    ...options,
  });
}
