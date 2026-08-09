import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/** Used whenever `EvidentConfig.runRetentionDays` and a CLI override are both unset. */
export const DEFAULT_RETENTION_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PruneResult {
  prunedCount: number;
}

/**
 * Deletes run bundles older than `retentionDays` from `runsDir`, based on
 * each file's modification time (bundles are write-once, so mtime is a
 * reliable, cheap stand-in for "when this run happened" without having to
 * read and parse every file). `false` disables pruning entirely. A
 * missing `runsDir` (no runs yet) is a no-op, not an error.
 */
export async function pruneOldRunBundles(
  runsDir: string,
  retentionDays: number | false,
  now: number = Date.now(),
): Promise<PruneResult> {
  if (retentionDays === false) {
    return { prunedCount: 0 };
  }

  const cutoff = now - retentionDays * MS_PER_DAY;

  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch {
    return { prunedCount: 0 };
  }

  let prunedCount = 0;
  await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.json'))
      .map(async (entry) => {
        const fullPath = join(runsDir, entry);
        try {
          const stats = await stat(fullPath);
          if (stats.mtimeMs < cutoff) {
            await unlink(fullPath);
            prunedCount += 1;
          }
        } catch {
          /**
           * Disappeared between readdir and stat/unlink (e.g. a concurrent
           * `evident clean`) — not an error, just already gone.
           */
        }
      }),
  );

  return { prunedCount };
}
