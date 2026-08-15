import { parseDuration } from './duration.js';

export interface PollOptions {
  /** Wait this long before the first attempt. Omit to start polling immediately. */
  delay?: string;
  /** Soft threshold. Passing after this still resolves, flagged `pass-flagged-slow`. Defaults to `'5s'`. */
  expectBy?: string;
  /** Hard threshold. No pass by this point rejects with {@link PollTimeoutError}. Defaults to `'30s'`. */
  timeout?: string;
}

export type PollOutcome = 'pass' | 'pass-flagged-slow';

export interface PollResult {
  outcome: PollOutcome;
  /** Time from the first attempt (after `delay`, if any) to the passing attempt, in milliseconds. */
  durationMs: number;
  /** Number of times `condition` was called, including the passing attempt. */
  attempts: number;
}

const DEFAULT_EXPECT_BY = '5s';
const DEFAULT_TIMEOUT = '30s';

/**
 * Layers a per-call `options` over `evident.config.ts`'s `defaultPollOptions`
 * (if declared) — a per-call value always wins, an undeclared one falls
 * through to the config default, and if neither is set {@link poll} applies
 * its own hardcoded fallback. Pure; doesn't touch `poll`'s own defaults.
 */
export function mergePollOptions(
  defaults: PollOptions | undefined,
  options: PollOptions = {},
): PollOptions {
  return defaults ? { ...defaults, ...options } : options;
}

/**
 * Same schedule Playwright's own `toPass()`/`expect.poll()` use by default
 * (verified against `research/playwright`'s `pollAgainstDeadline`) — a
 * proven backoff shape, not reinvented: fast retries early, settling at 1s.
 */
const RETRY_INTERVALS_MS = [100, 250, 500, 1000];

/** Thrown by {@link poll} when `condition` never passes within `timeout`. */
export class PollTimeoutError extends Error {
  readonly attempts: number;
  override readonly cause: unknown;

  constructor(message: string, attempts: number, cause: unknown) {
    super(message);
    this.name = 'PollTimeoutError';
    this.attempts = attempts;
    this.cause = cause;
  }
}

/**
 * Thrown from a `condition` to abort {@link poll} immediately instead of
 * retrying — for failures that are already final facts (e.g. a duplicate
 * correlation match), as opposed to "not true yet." A generic `poll()`
 * condition would otherwise get retried indefinitely into a confusing
 * `PollTimeoutError`, hiding the real cause.
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `condition` until it stops throwing, or `timeout` elapses.
 *
 * @param condition - Assertion to retry. Throw (e.g. via `expect(...)`) to
 *   signal "not true yet"; return normally to signal a pass.
 * @returns Once `condition` passes.
 * @throws {PollTimeoutError} If `condition` still throws once `timeout` is reached.
 */
export async function poll(
  condition: () => void | Promise<void>,
  options: PollOptions = {},
): Promise<PollResult> {
  const expectByLabel = options.expectBy ?? DEFAULT_EXPECT_BY;
  const timeoutLabel = options.timeout ?? DEFAULT_TIMEOUT;
  const expectByMs = parseDuration(expectByLabel);
  const timeoutMs = parseDuration(timeoutLabel);

  if (expectByMs > timeoutMs) {
    throw new Error(`expectBy (${expectByLabel}) cannot exceed timeout (${timeoutLabel}).`);
  }

  if (options.delay) {
    await wait(parseDuration(options.delay));
  }

  const start = Date.now();
  const intervals = [...RETRY_INTERVALS_MS];
  const lastInterval = intervals[intervals.length - 1] ?? 1000;

  let attempts = 0;
  let lastError: unknown;

  for (;;) {
    attempts += 1;
    try {
      await condition();
      const durationMs = Date.now() - start;
      return {
        outcome: durationMs > expectByMs ? 'pass-flagged-slow' : 'pass',
        durationMs,
        attempts,
      };
    } catch (error) {
      if (error instanceof NonRetryableError) {
        throw error;
      }
      lastError = error;
      const elapsedMs = Date.now() - start;
      if (elapsedMs >= timeoutMs) {
        throw new PollTimeoutError(
          `Condition did not pass within ${timeoutLabel} (${attempts.toString()} attempt${attempts === 1 ? '' : 's'}).`,
          attempts,
          lastError,
        );
      }
      const interval = intervals.shift() ?? lastInterval;
      const remainingMs = timeoutMs - (Date.now() - start);
      await wait(Math.min(interval, Math.max(remainingMs, 0)));
    }
  }
}
