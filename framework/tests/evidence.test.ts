import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResolvedService } from '../src/config.js';
import { createEvidence, logFileSize } from '../src/evidence.js';

let dir: string;
let logPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'evident-evidence-'));
  logPath = join(dir, 'service.log');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function services(): Record<string, ResolvedService> {
  return {
    'receiver-service': {
      name: 'receiver-service',
      baseUrl: 'http://localhost:8082',
      logPath,
      correlation: 'heuristic',
    },
  };
}

describe('createEvidence', () => {
  it('waitFor resolves once the pattern appears after the fire offset', async () => {
    await writeFile(logPath, 'startup line\n');
    const offset = await logFileSize(logPath);
    const evidence = createEvidence(services(), new Map([['receiver-service', offset]]));

    const promise = evidence
      .logs('receiver-service')
      .waitFor('processed record r1', { expectBy: '1s', timeout: '5s' });

    await appendFile(logPath, 'processed record r1\n');
    const result = await promise;

    expect(result.outcome).toBe('pass');
  });

  it('ignores a match that only appears before the fire offset', async () => {
    await writeFile(logPath, 'processed record stale\n');
    const offset = await logFileSize(logPath);
    const evidence = createEvidence(services(), new Map([['receiver-service', offset]]));

    const promise = evidence
      .logs('receiver-service')
      .waitFor('processed record stale', { expectBy: '20ms', timeout: '150ms' });

    await expect(promise).rejects.toThrow();
  }, 2000);

  it('rejects immediately when the log file does not exist, without polling', async () => {
    const evidence = createEvidence(services(), new Map());

    await expect(
      evidence.logs('receiver-service').waitFor('anything', { expectBy: '100ms', timeout: '1s' }),
    ).rejects.toThrow(/not found/);
  });

  it('contains() checks only bytes appended after the fire offset', async () => {
    await writeFile(logPath, 'before\n');
    const offset = await logFileSize(logPath);
    await appendFile(logPath, 'after\n');

    const evidence = createEvidence(services(), new Map([['receiver-service', offset]]));

    expect(await evidence.logs('receiver-service').contains('after')).toBe(true);
    expect(await evidence.logs('receiver-service').contains('before')).toBe(false);
  });
});
