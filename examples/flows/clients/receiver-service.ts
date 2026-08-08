/**
 * Typed wrapper around receiver-service's evidence — this service is never
 * triggered directly (caller-service calls it internally), only observed.
 * `expectProcessed` wraps the repeated "processed record {id}" log
 * assertion so its message format and matchOn shape live in one place.
 * `Evidence` is a minimal local stand-in for whatever `evident` actually
 * exports once evidence.logs() is implemented for real (see
 * flows/README.md).
 */

export interface WaitForOptions {
  matchOn?: string;
  value?: string;
  delay?: string;
  expectBy?: string;
  timeout?: string;
}

export interface LogEvidence {
  waitFor(pattern: string, options: WaitForOptions): Promise<void>;
  contains(pattern: string): Promise<boolean>;
}

export interface Evidence {
  logs(service: string): LogEvidence;
}

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
