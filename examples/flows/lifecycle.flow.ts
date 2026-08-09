import { defineFlow, expect, beforeAll, afterAll, beforeEach, afterEach, configureSuite, defineFixture } from 'evident';
import { triggerCaller } from './clients/caller-service.js';
import { expectProcessed } from './clients/receiver-service.js';

/**
 * Suite lifecycle: hooks, fixtures, and serial execution mode
 * (docs/flow-model.md §4-6). seedBatch and verifyBatch depend on each
 * other by design — serial mode guarantees the order, a Suite-scoped
 * fixture owns the shared state, matching flow-model.md §5's guidance
 * over closures-over-shared-variables.
 */
configureSuite({ mode: 'serial' });

beforeAll(() => {
  console.log('lifecycle suite starting');
});

afterAll(() => {
  console.log('lifecycle suite finished');
});

beforeEach(() => {
  console.log('flow starting');
});

afterEach(() => {
  console.log('flow finished');
});

interface BatchState {
  batchId: string;
  recordIds: string[];
}

/**
 * Suite-scoped: created once for the whole Suite (setup), shared by every
 * Flow that requests it, torn down after the last one finishes.
 */
const batchFixture = defineFixture<BatchState>({
  scope: 'suite',
  async setup(_deps, { use }) {
    await use({ batchId: `lifecycle-batch-${Date.now()}`, recordIds: [] });
  },
});

/**
 * Flow-scoped: fresh per Flow, on-demand. Depends on batchFixture — the
 * generated recordId is appended to the shared batch so later Flows in the
 * Suite (verifyBatch) can read it back.
 */
const recordIdFixture = defineFixture<{ recordId: string }, BatchState>({
  scope: 'flow',
  deps: batchFixture,
  async setup(batch, { use }) {
    const recordId = `${batch.batchId}-${batch.recordIds.length}`;
    batch.recordIds.push(recordId);
    await use({ recordId });
  },
});

/**
 * Automatic — runs for every Flow in this Suite without being explicitly
 * requested, per flow-model.md §9.4's flagship example: a cheap,
 * deterministic net that fails the Flow if either service logs an
 * unexpected ERROR/Exception during its execution window.
 */
const noUnexpectedErrorsFixture = defineFixture<void>({
  scope: 'flow',
  auto: true,
  async setup(_deps, { use }) {
    await use(undefined);
  },
});

export const seedBatch = defineFlow({
  name: 'lifecycle-seed-batch',
  services: ['caller-service', 'receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  fixtures: [batchFixture, recordIdFixture, noUnexpectedErrorsFixture],
  async run({ trigger, evidence, fixtures }) {
    const { recordId } = fixtures;

    const res = await triggerCaller(trigger, {
      recordId,
      delayMs: 300,
      mode: 'sync',
      simulateFailure: false,
    });

    expect(res.status).toBe(200);
    await expectProcessed(evidence, recordId, { expectBy: '2s', timeout: '10s' });
  },
});

export const verifyBatch = defineFlow({
  name: 'lifecycle-verify-batch',
  services: ['receiver-service'],
  safety: 'safe',
  correlation: 'heuristic',
  fixtures: [batchFixture, noUnexpectedErrorsFixture],
  async run({ evidence, fixtures }) {
    const { recordIds } = fixtures;

    expect(recordIds.length).toBeGreaterThan(0);
    const [recordId] = recordIds;
    await evidence.logs('receiver-service').waitFor(`processed record ${recordId}`, {
      expectBy: '1s',
      timeout: '5s',
    });
  },
});
