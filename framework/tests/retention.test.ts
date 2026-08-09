import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION_DAYS, pruneOldRunBundles } from '../src/run/retention.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'evident-retention-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('pruneOldRunBundles', () => {
  it('deletes a bundle older than the retention window', async () => {
    const createdAt = Date.now();
    await writeFile(join(dir, 'old-run.json'), '{}');

    const result = await pruneOldRunBundles(dir, 14, createdAt + 20 * MS_PER_DAY);

    expect(result.prunedCount).toBe(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it('keeps a bundle within the retention window', async () => {
    const createdAt = Date.now();
    await writeFile(join(dir, 'recent-run.json'), '{}');

    const result = await pruneOldRunBundles(dir, 14, createdAt + 5 * MS_PER_DAY);

    expect(result.prunedCount).toBe(0);
    expect(await readdir(dir)).toEqual(['recent-run.json']);
  });

  it('deletes nothing when retention is disabled (false)', async () => {
    const createdAt = Date.now();
    await writeFile(join(dir, 'ancient-run.json'), '{}');

    const result = await pruneOldRunBundles(dir, false, createdAt + 1000 * MS_PER_DAY);

    expect(result.prunedCount).toBe(0);
    expect(await readdir(dir)).toEqual(['ancient-run.json']);
  });

  it('is a no-op when the directory does not exist yet', async () => {
    const result = await pruneOldRunBundles(join(dir, 'never-created'), 14);
    expect(result.prunedCount).toBe(0);
  });

  it('only touches .json files, leaving anything else alone', async () => {
    const createdAt = Date.now();
    await writeFile(join(dir, 'old-run.json'), '{}');
    await writeFile(join(dir, '.gitkeep'), '');

    await pruneOldRunBundles(dir, 14, createdAt + 20 * MS_PER_DAY);

    expect(await readdir(dir)).toEqual(['.gitkeep']);
  });

  it('prunes multiple old bundles and counts them correctly', async () => {
    const createdAt = Date.now();
    await Promise.all([
      writeFile(join(dir, 'a.json'), '{}'),
      writeFile(join(dir, 'b.json'), '{}'),
      writeFile(join(dir, 'c.json'), '{}'),
    ]);

    const result = await pruneOldRunBundles(dir, 14, createdAt + 20 * MS_PER_DAY);

    expect(result.prunedCount).toBe(3);
    expect(await readdir(dir)).toEqual([]);
  });

  it('exports a 14-day default', () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(14);
  });
});
