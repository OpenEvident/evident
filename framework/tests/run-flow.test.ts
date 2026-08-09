import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EvidentConfig } from '../src/config.js';
import { defineFlow } from '../src/define-flow.js';
import { runFlow } from '../src/run-flow.js';

let dir: string;
let logPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'evident-run-flow-'));
  logPath = join(dir, 'receiver.log');
  await writeFile(logPath, 'unrelated pre-existing log line\n');

  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ recordId: 'r1', status: 'completed' }), { status: 200 }),
      ),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

it('resolves config, fires the trigger, and waits on evidence bounded to that fire — end to end', async () => {
  const config: EvidentConfig = {
    defaultTarget: 'local',
    services: {
      'caller-service': {
        local: { baseUrl: 'http://localhost:8081', logPath, correlation: 'heuristic' },
      },
    },
  };

  const flow = defineFlow({
    name: 'run-flow-integration',
    services: ['caller-service'],
    safety: 'safe',
    correlation: 'heuristic',
    async run({ trigger, evidence }) {
      const res = await trigger.api<{ recordId: string; status: string }>('caller-service', {
        method: 'POST',
        path: '/trigger',
        body: { recordId: 'r1' },
      });

      if (res.status !== 200) {
        throw new Error('unexpected status');
      }

      await appendFile(logPath, 'processed record r1\n');
      await evidence
        .logs('caller-service')
        .waitFor('processed record r1', { expectBy: '1s', timeout: '5s' });
    },
  });

  await runFlow(flow, config);

  expect(fetch).toHaveBeenCalledTimes(1);
});
