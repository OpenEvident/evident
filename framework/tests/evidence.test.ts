import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResolvedService } from '../src/config.js';
import { createEvidence, logFileSize } from '../src/evidence/evidence.js';
import { DuplicateMatchError } from '../src/evidence/matching.js';

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

  it('waitFor resolves with matchedVia "structured-field" for an exact JSON matchOn lookup', async () => {
    await writeFile(logPath, '');
    const offset = await logFileSize(logPath);
    const evidence = createEvidence(services(), new Map([['receiver-service', offset]]));

    const promise = evidence.logs('receiver-service').waitFor('processed record r1', {
      matchOn: [{ field: 'recordId', value: 'r1' }],
      expectBy: '1s',
      timeout: '5s',
    });

    await appendFile(logPath, '{"recordId":"r1","msg":"processed record r1"}\n');
    const result = await promise;

    expect(result.matchedVia).toBe('structured-field');
  });

  it('waitFor resolves with matchedVia "trace-id" when the matched JSON line also carries a trace_id', async () => {
    await writeFile(logPath, '');
    const offset = await logFileSize(logPath);
    const evidence = createEvidence(services(), new Map([['receiver-service', offset]]));

    const promise = evidence.logs('receiver-service').waitFor('processed record r1', {
      matchOn: [{ field: 'recordId', value: 'r1' }],
      expectBy: '1s',
      timeout: '5s',
    });

    await appendFile(
      logPath,
      '{"recordId":"r1","trace_id":"abc123","msg":"processed record r1"}\n',
    );
    const result = await promise;

    expect(result.matchedVia).toBe('trace-id');
  });

  it('waitFor resolves with matchedVia "substring" for a plain-text match', async () => {
    await writeFile(logPath, '');
    const offset = await logFileSize(logPath);
    const evidence = createEvidence(services(), new Map([['receiver-service', offset]]));

    const promise = evidence
      .logs('receiver-service')
      .waitFor('processed record r1', { expectBy: '1s', timeout: '5s' });

    await appendFile(logPath, 'processed record r1\n');
    const result = await promise;

    expect(result.matchedVia).toBe('substring');
  });

  it('waitFor rejects with DuplicateMatchError when matchOn finds more than expectedMatches', async () => {
    await writeFile(logPath, '{"recordId":"r1","msg":"first"}\n{"recordId":"r1","msg":"second"}\n');
    const evidence = createEvidence(services(), new Map([['receiver-service', 0]]));

    await expect(
      evidence.logs('receiver-service').waitFor('irrelevant', {
        matchOn: [{ field: 'recordId', value: 'r1' }],
        expectBy: '1s',
        timeout: '5s',
      }),
    ).rejects.toBeInstanceOf(DuplicateMatchError);
  });

  it('waitFor does not retry into a timeout when a duplicate is found — fails fast instead', async () => {
    await writeFile(logPath, '{"recordId":"r1","msg":"first"}\n{"recordId":"r1","msg":"second"}\n');
    const evidence = createEvidence(services(), new Map([['receiver-service', 0]]));

    const start = Date.now();
    await expect(
      evidence.logs('receiver-service').waitFor('irrelevant', {
        matchOn: [{ field: 'recordId', value: 'r1' }],
        expectBy: '1s',
        timeout: '10s',
      }),
    ).rejects.toBeInstanceOf(DuplicateMatchError);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('contains() checks structured matchOn fields, not just substring', async () => {
    await writeFile(logPath, '');
    const offset = await logFileSize(logPath);
    await appendFile(logPath, '{"recordId":"r2","msg":"processed record r1"}\n');

    const evidence = createEvidence(services(), new Map([['receiver-service', offset]]));

    expect(
      await evidence
        .logs('receiver-service')
        .contains('processed record r1', { matchOn: [{ field: 'recordId', value: 'r1' }] }),
    ).toBe(false);
    expect(
      await evidence
        .logs('receiver-service')
        .contains('processed record r1', { matchOn: [{ field: 'recordId', value: 'r2' }] }),
    ).toBe(true);
  });
});
