import { readFile, stat } from 'node:fs/promises';
import type { ResolvedService } from '../config.js';
import { findMatches, type MatchedVia, type MatchOnField } from './matching.js';
import { mergePollOptions, poll, type PollOptions, type PollResult } from './poll.js';

export interface WaitForOptions extends PollOptions {
  /**
   * Declares the field(s)/value(s) this search is keyed on — all AND'd
   * together. When a log line parses as JSON, these are checked as an
   * exact structured lookup (architecture.md §5's "structured-field" rung)
   * rather than folded into the `pattern` substring scan; when it doesn't
   * parse, `pattern` alone decides the match.
   */
  matchOn?: MatchOnField[];
  /**
   * How many matches are expected within the search window. Defaults to
   * exactly `1` — a second match is a fact about evidence that already
   * exists (a genuine duplicate, not a "not yet" state), so it fails
   * immediately as {@link import('./matching.js').DuplicateMatchError}
   * instead of being retried into a timeout. Pass `'any'` when duplicates
   * are a known, benign possibility (e.g. at-least-once delivery). Only
   * enforced when `matchOn` is declared — a bare substring `pattern` was
   * never meant to identify a single record.
   */
  expectedMatches?: number | 'any';
}

export interface WaitForResult extends PollResult {
  /** Which rung of the match ladder actually matched (architecture.md §5). Absent if `waitFor` never resolves successfully. */
  matchedVia?: MatchedVia;
  /**
   * The matched line's parsed JSON payload, when the match resolved via
   * `structured-field` or `trace-id` — lets a Flow read a value (e.g. an
   * ID the service only ever emitted in a log line) without a separate
   * REST call just to look it up again. Absent for a `substring` match, or
   * a match with no matchOn-driven JSON parse.
   */
  record?: Record<string, unknown>;
}

export interface LogEvidence {
  /**
   * Polls until `pattern`/`matchOn` matches, or fails per `options`.
   * Checks the log file actually exists before polling starts — a
   * missing file is an infrastructure failure and rejects immediately,
   * never silently retried as "not true yet."
   *
   * @throws {import('./matching.js').DuplicateMatchError} If `matchOn` is
   *   declared and more lines match than `options.expectedMatches` allows.
   */
  waitFor(pattern: string, options?: WaitForOptions): Promise<WaitForResult>;
  /** Single-shot check, for use inside a custom {@link poll} condition. Never enforces `expectedMatches` — "at least one match" is all a boolean result can express. */
  contains(pattern: string, options?: { matchOn?: readonly MatchOnField[] }): Promise<boolean>;
}

export interface Evidence {
  logs(service: string): LogEvidence;
}

export interface EvidenceSnapshot {
  logPath: string;
  /** Byte offset the log file was at when the Flow's trigger fired — everything from here on is this run's evidence window. */
  fireOffsetBytes: number;
  /**
   * Full raw content appended since `fireOffsetBytes`, unredacted — not
   * just what an assertion matched against. Untrusted, externally-
   * influenced data (architecture.md §8, Decision 23) — it can contain
   * anything an external caller sent the service under test (webhook
   * payloads, user-submitted fields). Whatever eventually reads this
   * (the AI Review Layer) must treat it as data, never as instructions.
   */
  raw: string;
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Current size of a service's log file in bytes, or 0 if it doesn't exist yet. */
export async function logFileSize(logPath: string): Promise<number> {
  try {
    const stats = await stat(logPath);
    return stats.size;
  } catch (error) {
    if (isEnoent(error)) {
      return 0;
    }
    throw error;
  }
}

async function assertLogFileExists(logPath: string, service: string): Promise<void> {
  try {
    await stat(logPath);
  } catch {
    throw new Error(`Log file for "${service}" not found at ${logPath} — is the service running?`);
  }
}

async function readLogSince(logPath: string, offsetBytes: number): Promise<string> {
  const buffer = await readFile(logPath);
  if (buffer.length <= offsetBytes) {
    return '';
  }
  return buffer.subarray(offsetBytes).toString('utf8');
}

/**
 * Captures the full raw log content appended since each service's fire
 * offset — the run bundle's "full raw evidence," not just matched
 * snippets (architecture.md §6). A service whose log file doesn't exist
 * (or was never fired against) yields an empty snapshot rather than
 * throwing — this runs after the Flow has already finished, so failing
 * fast here would only hide the Flow's own outcome behind a confusing
 * secondary error.
 */
export async function captureEvidenceSnapshots(
  services: Record<string, ResolvedService>,
  fireOffsets: Map<string, number>,
): Promise<Record<string, EvidenceSnapshot>> {
  const snapshots: Record<string, EvidenceSnapshot> = {};

  await Promise.all(
    Object.values(services).map(async (service) => {
      const fireOffsetBytes = fireOffsets.get(service.name) ?? 0;
      const raw = await readLogSince(service.logPath, fireOffsetBytes).catch(() => '');
      snapshots[service.name] = { logPath: service.logPath, fireOffsetBytes, raw };
    }),
  );

  return snapshots;
}

/**
 * Builds an {@link Evidence} collector bound to `services`. `fireOffsets`
 * maps each service to the byte offset its log file was at when the
 * Flow's trigger fired — every search here only looks at bytes appended
 * after that point, which is what keeps a stale match from a previous run
 * against the same append-only log file from ever matching (architecture.md §5).
 * `defaultPollOptions` (from `evident.config.ts`) fills in whatever a
 * `waitFor` call's own `options` doesn't declare.
 */
export function createEvidence(
  services: Record<string, ResolvedService>,
  fireOffsets: Map<string, number>,
  defaultPollOptions?: PollOptions,
): Evidence {
  return {
    logs(service: string): LogEvidence {
      const resolved = services[service];
      if (!resolved) {
        throw new Error(
          `Unknown service "${service}" — not part of this Flow's declared services.`,
        );
      }

      return {
        async waitFor(pattern: string, options: WaitForOptions = {}) {
          await assertLogFileExists(resolved.logPath, service);
          const offset = fireOffsets.get(service) ?? 0;
          let matchedVia: MatchedVia | undefined;
          let record: Record<string, unknown> | undefined;

          const result = await poll(
            async () => {
              const text = await readLogSince(resolved.logPath, offset);
              const found = findMatches(
                text,
                pattern,
                options.matchOn,
                options.expectedMatches ?? 1,
              );
              if (!found) {
                throw new Error(`Pattern "${pattern}" not yet found in "${service}"'s logs.`);
              }
              matchedVia = found.matchedVia;
              record = found.record;
            },
            mergePollOptions(defaultPollOptions, options),
          );

          const augmented: WaitForResult = { ...result };
          if (matchedVia !== undefined) {
            augmented.matchedVia = matchedVia;
          }
          if (record !== undefined) {
            augmented.record = record;
          }
          return augmented;
        },

        async contains(pattern: string, options: { matchOn?: readonly MatchOnField[] } = {}) {
          const offset = fireOffsets.get(service) ?? 0;
          const text = await readLogSince(resolved.logPath, offset);
          return findMatches(text, pattern, options.matchOn, 'any') !== undefined;
        },
      };
    },
  };
}
