import { readFile, stat } from 'node:fs/promises';
import type { ResolvedService } from '../config.js';
import { poll, type PollOptions, type PollResult } from './poll.js';

export interface WaitForOptions extends PollOptions {
  /**
   * Declares the correlation field this search is keyed on, for the run
   * bundle's record of "the correlation key/value actually used"
   * (architecture.md §6). Doesn't change the search itself — `pattern` is
   * what's actually matched against.
   */
  matchOn?: string;
  /** The value `matchOn` refers to. See {@link WaitForOptions.matchOn}. */
  value?: string;
}

export interface LogEvidence {
  /**
   * Polls until `pattern` appears in the log, or fails per `options`.
   * Checks the log file actually exists before polling starts — a
   * missing file is an infrastructure failure and rejects immediately,
   * never silently retried as "not true yet."
   */
  waitFor(pattern: string, options?: WaitForOptions): Promise<PollResult>;
  /** Single-shot check, for use inside a custom {@link poll} condition. */
  contains(pattern: string): Promise<boolean>;
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
 */
export function createEvidence(
  services: Record<string, ResolvedService>,
  fireOffsets: Map<string, number>,
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

          return poll(async () => {
            const text = await readLogSince(resolved.logPath, offset);
            if (!text.includes(pattern)) {
              throw new Error(`Pattern "${pattern}" not yet found in "${service}"'s logs.`);
            }
          }, options);
        },

        async contains(pattern: string) {
          const offset = fireOffsets.get(service) ?? 0;
          const text = await readLogSince(resolved.logPath, offset);
          return text.includes(pattern);
        },
      };
    },
  };
}
