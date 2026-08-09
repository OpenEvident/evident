import type { Evidence, LogEvidence, WaitForOptions } from '../evidence/evidence.js';
import {
  PollTimeoutError,
  poll as rawPoll,
  type PollOptions,
  type PollResult,
} from '../evidence/poll.js';
import { redactValue } from '../evidence/redact.js';
import {
  TriggerError,
  type Trigger,
  type TriggerRequest,
  type TriggerResponse,
} from '../evidence/trigger.js';
import type { AssertionRecord, TriggerRecord } from './run-bundle.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function attemptsOf(error: unknown): number {
  return error instanceof PollTimeoutError ? error.attempts : 0;
}

function redactedRequest(request: TriggerRequest): TriggerRecord['request'] {
  const record: TriggerRecord['request'] = { method: request.method, path: request.path };
  if (request.body !== undefined) {
    record.body = redactValue(request.body);
  }
  return record;
}

/** Wraps a {@link Trigger} so every call is recorded (redacted) into the run bundle, success or failure. */
export function recordingTrigger(
  trigger: Trigger,
  record: (entry: TriggerRecord) => void,
): Trigger {
  return {
    async api<TBody = unknown>(
      service: string,
      request: TriggerRequest,
    ): Promise<TriggerResponse<TBody>> {
      const firedAt = new Date().toISOString();
      try {
        const response = await trigger.api<TBody>(service, request);
        record({
          service,
          request: redactedRequest(request),
          firedAt,
          response: { status: response.status, body: redactValue(response.body) },
        });
        return response;
      } catch (error) {
        if (error instanceof TriggerError) {
          record({
            service,
            request: redactedRequest(request),
            firedAt,
            error: { name: error.name, message: error.message, status: error.status },
          });
        }
        throw error;
      }
    },
  };
}

function assertionRecord(
  base: Pick<AssertionRecord, 'service' | 'pattern'>,
  options: WaitForOptions,
  outcome: AssertionRecord['outcome'],
  durationMs: number,
  attempts: number,
  error?: string,
): AssertionRecord {
  const record: AssertionRecord = { ...base, outcome, durationMs, attempts };
  if (options.matchOn !== undefined) {
    record.matchOn = options.matchOn;
  }
  if (options.value !== undefined) {
    record.value = options.value;
  }
  if (options.expectBy !== undefined) {
    record.expectBy = options.expectBy;
  }
  if (options.timeout !== undefined) {
    record.timeout = options.timeout;
  }
  if (error !== undefined) {
    record.error = error;
  }
  return record;
}

/** Wraps an {@link Evidence} collector so every `waitFor` call is recorded into the run bundle as an assertion, success or failure. */
export function recordingEvidence(
  evidence: Evidence,
  record: (entry: AssertionRecord) => void,
): Evidence {
  return {
    logs(service: string): LogEvidence {
      const log = evidence.logs(service);
      return {
        async waitFor(pattern: string, options: WaitForOptions = {}): Promise<PollResult> {
          const start = Date.now();
          try {
            const result = await log.waitFor(pattern, options);
            record(
              assertionRecord(
                { service, pattern },
                options,
                result.outcome,
                result.durationMs,
                result.attempts,
              ),
            );
            return result;
          } catch (error) {
            record(
              assertionRecord(
                { service, pattern },
                options,
                'fail',
                Date.now() - start,
                attemptsOf(error),
                errorMessage(error),
              ),
            );
            throw error;
          }
        },
        contains: (pattern: string) => log.contains(pattern),
      };
    },
  };
}

/** Wraps `poll` so a Flow's direct `poll(...)` calls (not routed through `evidence`) are also recorded into the run bundle. */
export function recordingPoll(
  record: (entry: AssertionRecord) => void,
): (condition: () => void | Promise<void>, options?: PollOptions) => Promise<PollResult> {
  return async (condition, options = {}) => {
    const start = Date.now();
    try {
      const result = await rawPoll(condition, options);
      record(assertionRecord({}, options, result.outcome, result.durationMs, result.attempts));
      return result;
    } catch (error) {
      record(
        assertionRecord(
          {},
          options,
          'fail',
          Date.now() - start,
          attemptsOf(error),
          errorMessage(error),
        ),
      );
      throw error;
    }
  };
}
