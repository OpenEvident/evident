/**
 * Typed wrapper around receiver-service's evidence — this service is never
 * triggered directly (caller-service calls it internally), only observed.
 * `expectProcessed` wraps the repeated "processed record {id}" log
 * assertion so its message format and matchOn shape live in one place.
 *
 * Two matchOn fields, not one: receiver-service's structured logs (see
 * examples/services/README.md) stamp `recordId` into MDC once per request,
 * so both its "received record ..." and "processed record ..." lines carry
 * the same recordId — a single-field lookup can't tell them apart once a
 * line is JSON (structured-field matching never falls back to checking
 * `pattern` text, architecture.md §5). Pinning `message` too disambiguates
 * exactly like the substring rung already does via `pattern`.
 */
import type { Evidence, WaitForOptions } from 'evident';

export function expectProcessed(
  evidence: Evidence,
  recordId: string,
  options: Pick<WaitForOptions, 'delay' | 'expectBy' | 'timeout'>,
) {
  const message = `processed record ${recordId}`;
  return evidence.logs('receiver-service').waitFor(message, {
    matchOn: [
      { field: 'recordId', value: recordId },
      { field: 'message', value: message },
    ],
    ...options,
  });
}
