import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvidentConfig } from '../src/config.js';
import { defineFixture } from '../src/flow/fixture.js';
import { defineFlow, type Flow } from '../src/flow/define-flow.js';
import { runSuite } from '../src/run/run-suite.js';
import {
  beginSuiteRegistration,
  configureSuite,
  endSuiteRegistration,
} from '../src/flow/suite-context.js';
import {
  beforeAll as suiteBeforeAll,
  afterAll as suiteAfterAll,
  beforeEach as suiteBeforeEach,
  afterEach as suiteAfterEach,
} from '../src/flow/suite-context.js';

let dir: string;
let logPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'evident-run-suite-'));
  logPath = join(dir, 'service.log');
  await writeFile(logPath, '');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
      ),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

function config(): EvidentConfig {
  return {
    defaultTarget: 'local',
    services: {
      'caller-service': {
        local: { baseUrl: 'http://localhost:8081', logPath, correlation: 'heuristic' },
      },
    },
  };
}

function trivialFlow(name: string, overrides: Partial<Flow> = {}): Flow {
  return defineFlow({
    name,
    services: ['caller-service'],
    safety: 'safe',
    correlation: 'heuristic',
    async run({ trigger }) {
      await trigger.api('caller-service', { method: 'POST', path: '/x', body: { name } });
    },
    ...overrides,
  });
}

function failingFlow(name: string): Flow {
  return defineFlow({
    name,
    services: ['caller-service'],
    safety: 'safe',
    correlation: 'heuristic',
    run() {
      throw new Error(`${name} deliberately fails`);
    },
  });
}

describe('runSuite', () => {
  it('runs every Flow sequentially by default, in declared order', async () => {
    const order: string[] = [];
    const flows = [
      defineFlow({
        name: 'first',
        services: ['caller-service'],
        safety: 'safe',
        correlation: 'heuristic',
        async run({ trigger }) {
          order.push('first');
          await trigger.api('caller-service', { method: 'POST', path: '/x' });
        },
      }),
      defineFlow({
        name: 'second',
        services: ['caller-service'],
        safety: 'safe',
        correlation: 'heuristic',
        async run({ trigger }) {
          order.push('second');
          await trigger.api('caller-service', { method: 'POST', path: '/x' });
        },
      }),
    ];

    beginSuiteRegistration();
    const registration = endSuiteRegistration();
    const result = await runSuite(flows, registration, config());

    expect(order).toEqual(['first', 'second']);
    expect(result.bundles).toHaveLength(2);
    expect(result.bundles.every((b) => b.outcome === 'pass')).toBe(true);
    expect(result.skipped).toEqual([]);
  });

  it('runs every Flow even after an earlier one fails, in sequential mode', async () => {
    const flows = [failingFlow('a'), trivialFlow('b')];

    beginSuiteRegistration();
    const registration = endSuiteRegistration();
    const result = await runSuite(flows, registration, config());

    expect(result.bundles.map((b) => b.outcome)).toEqual(['fail', 'pass']);
    expect(result.skipped).toEqual([]);
  });

  it('stops at the first failure in serial mode and skips the rest', async () => {
    beginSuiteRegistration();
    configureSuite({ mode: 'serial' });
    const registration = endSuiteRegistration();

    const flows = [trivialFlow('a'), failingFlow('b'), trivialFlow('c')];
    const result = await runSuite(flows, registration, config());

    expect(result.bundles.map((b) => b.outcome)).toEqual(['pass', 'fail']);
    expect(result.skipped).toEqual([
      { name: 'c', reason: 'skipped — an earlier Flow ("b") in this serial group failed' },
    ]);
  });

  it('runs Flows concurrently in parallel mode', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const makeFlow = (name: string): Flow =>
      defineFlow({
        name,
        services: ['caller-service'],
        safety: 'safe',
        correlation: 'heuristic',
        async run({ trigger }) {
          concurrent += 1;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await trigger.api('caller-service', { method: 'POST', path: '/x' });
          concurrent -= 1;
        },
      });

    beginSuiteRegistration();
    configureSuite({ mode: 'parallel' });
    const registration = endSuiteRegistration();

    const result = await runSuite(
      [makeFlow('a'), makeFlow('b'), makeFlow('c')],
      registration,
      config(),
    );

    expect(maxConcurrent).toBeGreaterThan(1);
    expect(result.bundles).toHaveLength(3);
  });

  it('never runs Flows sharing a lock name concurrently, even in parallel mode', async () => {
    let concurrentLocked = 0;
    let maxConcurrentLocked = 0;

    const makeFlow = (name: string): Flow =>
      defineFlow({
        name,
        services: ['caller-service'],
        safety: 'safe',
        correlation: 'heuristic',
        lock: 'shared-resource',
        async run({ trigger }) {
          concurrentLocked += 1;
          maxConcurrentLocked = Math.max(maxConcurrentLocked, concurrentLocked);
          await trigger.api('caller-service', { method: 'POST', path: '/x' });
          concurrentLocked -= 1;
        },
      });

    beginSuiteRegistration();
    configureSuite({ mode: 'parallel' });
    const registration = endSuiteRegistration();

    await runSuite([makeFlow('a'), makeFlow('b')], registration, config());

    expect(maxConcurrentLocked).toBe(1);
  });

  it('skips a Flow marked skip without running it, preserving a string reason', async () => {
    const ran = vi.fn();
    const flow = defineFlow({
      name: 'skipped-flow',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      skip: 'flaky, tracked separately',
      run() {
        ran();
        return Promise.resolve();
      },
    });

    beginSuiteRegistration();
    const registration = endSuiteRegistration();
    const result = await runSuite([flow], registration, config());

    expect(ran).not.toHaveBeenCalled();
    expect(result.bundles).toEqual([]);
    expect(result.skipped).toEqual([{ name: 'skipped-flow', reason: 'flaky, tracked separately' }]);
  });

  it('runs beforeAll/afterAll once and beforeEach/afterEach once per executed Flow', async () => {
    const events: string[] = [];

    beginSuiteRegistration();
    suiteBeforeAll(() => {
      events.push('beforeAll');
    });
    suiteAfterAll(() => {
      events.push('afterAll');
    });
    suiteBeforeEach(() => {
      events.push('beforeEach');
    });
    suiteAfterEach(() => {
      events.push('afterEach');
    });
    const registration = endSuiteRegistration();

    await runSuite([trivialFlow('a'), trivialFlow('b')], registration, config());

    expect(events).toEqual([
      'beforeAll',
      'beforeEach',
      'afterEach',
      'beforeEach',
      'afterEach',
      'afterAll',
    ]);
  });

  it('shares one suiteRunId across every bundle from the run', async () => {
    beginSuiteRegistration();
    const registration = endSuiteRegistration();
    const result = await runSuite([trivialFlow('a'), trivialFlow('b')], registration, config());

    expect(result.bundles[0]?.suiteRunId).toBe(result.suiteRunId);
    expect(result.bundles[1]?.suiteRunId).toBe(result.suiteRunId);
  });

  it('sets up a Suite-scoped fixture once and shares it across Flows, tearing it down once at the end', async () => {
    const events: string[] = [];
    const sharedFixture = defineFixture<{ batchId: string }>({
      scope: 'suite',
      async setup(_deps, { use }) {
        events.push('setup');
        await use({ batchId: 'shared' });
        events.push('teardown');
      },
    });

    const flowA = defineFlow({
      name: 'a',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      fixtures: [sharedFixture],
      async run({ trigger, fixtures }) {
        expect(fixtures.batchId).toBe('shared');
        await trigger.api('caller-service', { method: 'POST', path: '/x' });
      },
    });
    const flowB = defineFlow({
      name: 'b',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      fixtures: [sharedFixture],
      async run({ trigger, fixtures }) {
        expect(fixtures.batchId).toBe('shared');
        await trigger.api('caller-service', { method: 'POST', path: '/x' });
      },
    });

    beginSuiteRegistration();
    const registration = endSuiteRegistration();
    await runSuite([flowA, flowB], registration, config());

    expect(events).toEqual(['setup', 'teardown']);
  });
});
