import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvidentConfig } from '../src/config.js';
import { defineFlow } from '../src/flow/define-flow.js';
import { defineFixture } from '../src/flow/fixture.js';
import { runFlow } from '../src/run/run-flow.js';

let dir: string;
let logPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'evident-run-flow-'));
  logPath = join(dir, 'receiver.log');
  await writeFile(logPath, 'unrelated pre-existing log line\n');
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

/** A fresh Response per call — Response bodies are single-read streams, so reusing one instance across retries breaks on the 2nd read. */
function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

describe('runFlow', () => {
  it('resolves config, fires the trigger, and waits on evidence bounded to that fire — end to end', async () => {
    stubFetch(200, { recordId: 'r1', status: 'completed', token: 'super-secret-value' });

    const flow = defineFlow({
      name: 'run-flow-integration',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      async run({ trigger, evidence }) {
        const res = await trigger.api<{ recordId: string; status: string }>('caller-service', {
          method: 'POST',
          path: '/trigger',
          body: { recordId: 'r1', token: 'do-not-leak-this' },
        });

        if (res.status !== 200) {
          throw new Error('unexpected status');
        }

        await appendFile(logPath, 'processed record r1\n');
        await appendFile(logPath, 'Authorization: Bearer abc.def.ghi\n');
        await evidence.logs('caller-service').waitFor('processed record r1', {
          matchOn: [{ field: 'recordId', value: 'r1' }],
          expectBy: '1s',
          timeout: '5s',
        });
      },
    });

    const bundle = await runFlow(flow, config());

    expect(fetch).toHaveBeenCalledTimes(1);

    // Bundle shape
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.runId).toBeTruthy();
    expect(bundle.outcome).toBe('pass');
    expect(bundle.target).toBe('local');
    expect(bundle.flow).toEqual({
      name: 'run-flow-integration',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
    });
    expect(bundle.error).toBeUndefined();

    // Trigger record, redacted
    expect(bundle.triggers).toHaveLength(1);
    expect(bundle.triggers[0]).toMatchObject({
      service: 'caller-service',
      request: { method: 'POST', path: '/trigger', body: { recordId: 'r1', token: '[REDACTED]' } },
      response: { status: 200, body: { recordId: 'r1', status: 'completed', token: '[REDACTED]' } },
    });

    // Assertion record
    expect(bundle.assertions).toHaveLength(1);
    expect(bundle.assertions[0]).toMatchObject({
      service: 'caller-service',
      pattern: 'processed record r1',
      matchOn: [{ field: 'recordId', value: 'r1' }],
      matchedVia: 'substring',
      outcome: 'pass',
    });
    expect(bundle.assertions[0]?.attempts).toBeGreaterThanOrEqual(1);

    // Full raw evidence — includes the Authorization line the assertion never checked for, redacted
    const evidenceSnapshot = bundle.evidence['caller-service'];
    expect(evidenceSnapshot?.raw).toContain('processed record r1');
    expect(evidenceSnapshot?.raw).toContain('Authorization: [REDACTED]');
    expect(evidenceSnapshot?.raw).not.toContain('abc.def.ghi');
    expect(evidenceSnapshot?.raw).not.toContain('unrelated pre-existing log line');
  });

  it('records matchedVia "structured-field" in the bundle when evidence is JSON with a matching field', async () => {
    stubFetch(200, { recordId: 'r1', status: 'completed' });

    const flow = defineFlow({
      name: 'run-flow-structured-field',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      async run({ trigger, evidence }) {
        await trigger.api('caller-service', {
          method: 'POST',
          path: '/trigger',
          body: { recordId: 'r1' },
        });

        await appendFile(logPath, '{"recordId":"r1","msg":"processed record r1"}\n');
        await evidence.logs('caller-service').waitFor('processed record r1', {
          matchOn: [{ field: 'recordId', value: 'r1' }],
          expectBy: '1s',
          timeout: '5s',
        });
      },
    });

    const bundle = await runFlow(flow, config());

    expect(bundle.outcome).toBe('pass');
    expect(bundle.assertions[0]).toMatchObject({
      matchOn: [{ field: 'recordId', value: 'r1' }],
      matchedVia: 'structured-field',
      outcome: 'pass',
    });
  });

  it('captures outcome: fail with the DuplicateMatchError message when matchOn finds more than one match', async () => {
    stubFetch(200, { recordId: 'r1', status: 'completed' });

    const flow = defineFlow({
      name: 'run-flow-duplicate-match',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      async run({ trigger, evidence }) {
        await trigger.api('caller-service', {
          method: 'POST',
          path: '/trigger',
          body: { recordId: 'r1' },
        });

        await appendFile(
          logPath,
          '{"recordId":"r1","msg":"first"}\n{"recordId":"r1","msg":"second"}\n',
        );
        await evidence.logs('caller-service').waitFor('irrelevant', {
          matchOn: [{ field: 'recordId', value: 'r1' }],
          expectBy: '1s',
          timeout: '5s',
        });
      },
    });

    const bundle = await runFlow(flow, config());

    expect(bundle.outcome).toBe('fail');
    expect(bundle.assertions[0]).toMatchObject({ outcome: 'fail' });
    expect(bundle.assertions[0]?.error).toMatch(/Found 2 matches, expected exactly 1/);
  });

  it('captures outcome: fail without throwing when a trigger call fails', async () => {
    stubFetch(500, { error: 'boom' });

    const flow = defineFlow({
      name: 'run-flow-trigger-failure',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      async run({ trigger }) {
        await trigger.api('caller-service', {
          method: 'POST',
          path: '/trigger',
          body: { recordId: 'r1' },
        });
      },
    });

    const bundle = await runFlow(flow, config());

    expect(bundle.outcome).toBe('fail');
    expect(bundle.error?.name).toBe('TriggerError');
    expect(bundle.triggers[0]?.error).toMatchObject({ name: 'TriggerError', status: 500 });
  });

  it('captures outcome: fail without throwing when an assertion never passes', async () => {
    stubFetch(200, { recordId: 'r1', status: 'completed' });

    const flow = defineFlow({
      name: 'run-flow-assertion-failure',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      async run({ trigger, evidence }) {
        await trigger.api('caller-service', {
          method: 'POST',
          path: '/trigger',
          body: { recordId: 'r1' },
        });
        // Never appended — this assertion is expected to fail.
        await evidence
          .logs('caller-service')
          .waitFor('processed record r1', { expectBy: '20ms', timeout: '80ms' });
      },
    });

    const bundle = await runFlow(flow, config());

    expect(bundle.outcome).toBe('fail');
    expect(bundle.error?.name).toBe('PollTimeoutError');
    expect(bundle.assertions[0]?.outcome).toBe('fail');
    expect(bundle.assertions[0]?.error).toBeTruthy();
  }, 2000);

  it("lets a Flow-scoped fixture use the Flow's own trigger to build a bound service client", async () => {
    stubFetch(200, { recordId: 'r1', status: 'imported' });

    const importClientFixture = defineFixture<{
      importProduct: (recordId: string) => Promise<{ status: number }>;
    }>({
      scope: 'flow',
      async setup(_deps, { use, trigger }) {
        await use({
          importProduct: async (recordId: string) => {
            const res = await trigger?.api('caller-service', {
              method: 'POST',
              path: '/trigger',
              body: { recordId },
            });
            return { status: res?.status ?? 0 };
          },
        });
      },
    });

    const flow = defineFlow({
      name: 'run-flow-fixture-bound-client',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      fixtures: [importClientFixture],
      async run({ fixtures }) {
        const result = await fixtures.importProduct('r1');
        expect(result.status).toBe(200);
      },
    });

    const bundle = await runFlow(flow, config());

    expect(bundle.outcome).toBe('pass');
    // The fixture's trigger call went through the real, recording trigger —
    // it shows up in the bundle exactly like a call made from run() itself.
    expect(bundle.triggers).toHaveLength(1);
    expect(bundle.triggers[0]).toMatchObject({
      service: 'caller-service',
      request: { method: 'POST', path: '/trigger', body: { recordId: 'r1' } },
    });
  });

  it('throws immediately for an infrastructure error (unresolvable service), before any bundle is built', async () => {
    const flow = defineFlow({
      name: 'run-flow-bad-config',
      services: ['not-a-real-service'],
      safety: 'safe',
      correlation: 'heuristic',
      async run() {
        // Never reached.
      },
    });

    await expect(runFlow(flow, config())).rejects.toThrow(/not declared/);
  });

  it('retries a failing Flow and records pass-after-retry once a later attempt succeeds', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount += 1;
        const status = callCount === 1 ? 500 : 200;
        return Promise.resolve(new Response(JSON.stringify({ recordId: 'r1' }), { status }));
      }),
    );

    const flow = defineFlow({
      name: 'run-flow-retry-eventually-passes',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      retries: 1,
      async run({ trigger }) {
        await trigger.api('caller-service', {
          method: 'POST',
          path: '/trigger',
          body: { recordId: 'r1' },
        });
      },
    });

    const bundle = await runFlow(flow, config());

    expect(bundle.outcome).toBe('pass-after-retry');
    expect(bundle.error).toBeUndefined();
    expect(bundle.triggers).toHaveLength(2);
    expect(bundle.triggers[0]?.error).toMatchObject({ status: 500 });
    expect(bundle.triggers[1]?.response).toMatchObject({ status: 200 });
  });

  it('fails once retries are exhausted, recording every attempt', async () => {
    stubFetch(500, { error: 'boom' });

    const flow = defineFlow({
      name: 'run-flow-retry-exhausted',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      retries: 2,
      async run({ trigger }) {
        await trigger.api('caller-service', {
          method: 'POST',
          path: '/trigger',
          body: { recordId: 'r1' },
        });
      },
    });

    const bundle = await runFlow(flow, config());

    expect(bundle.outcome).toBe('fail');
    expect(bundle.triggers).toHaveLength(3);
  });

  it('applies config.defaultPollOptions to a Flow’s direct poll(...) call', async () => {
    stubFetch(200, { recordId: 'r1' });

    const flow = defineFlow({
      name: 'run-flow-default-poll-options',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      async run({ trigger, poll }) {
        await trigger.api('caller-service', {
          method: 'POST',
          path: '/trigger',
          body: { recordId: 'r1' },
        });
        // No expectBy/timeout passed — must come from config.defaultPollOptions,
        // not poll()'s own 5s/30s fallback, or this test would hang for 30s.
        await poll(() => {
          throw new Error('never passes');
        });
      },
    });

    const configWithDefaults: EvidentConfig = {
      ...config(),
      defaultPollOptions: { timeout: '80ms' },
    };
    const start = Date.now();
    const bundle = await runFlow(flow, configWithDefaults);

    expect(bundle.outcome).toBe('fail');
    expect(Date.now() - start).toBeLessThan(1000);
  }, 2000);

  it('fails when the Flow exceeds its own timeout ceiling', async () => {
    const flow = defineFlow({
      name: 'run-flow-timeout-ceiling',
      services: ['caller-service'],
      safety: 'safe',
      correlation: 'heuristic',
      timeout: '50ms',
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 300));
      },
    });

    const bundle = await runFlow(flow, config());

    expect(bundle.outcome).toBe('fail');
    expect(bundle.error?.message).toMatch(/exceeded its 50ms timeout/);
  }, 2000);
});
