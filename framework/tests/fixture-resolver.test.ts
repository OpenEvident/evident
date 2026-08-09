import { describe, expect, it, vi } from 'vitest';
import { defineFixture, type Fixture } from '../src/flow/fixture.js';
import { FixtureResolver } from '../src/flow/fixture-resolver.js';

describe('FixtureResolver', () => {
  it('resolves a single Flow-scoped fixture and exposes its value', async () => {
    const fixture = defineFixture<{ recordId: string }>({
      scope: 'flow',
      async setup(_deps, { use }) {
        await use({ recordId: 'r1' });
      },
    });

    const resolver = new FixtureResolver();
    const { values } = await resolver.resolveForFlow([fixture]);

    expect(values).toEqual({ recordId: 'r1' });
  });

  it('merges multiple fixtures into one flat object', async () => {
    const a = defineFixture<{ a: string }>({
      scope: 'flow',
      async setup(_deps, { use }) {
        await use({ a: 'a-value' });
      },
    });
    const b = defineFixture<{ b: string }>({
      scope: 'flow',
      async setup(_deps, { use }) {
        await use({ b: 'b-value' });
      },
    });

    const resolver = new FixtureResolver();
    const { values } = await resolver.resolveForFlow([a, b]);

    expect(values).toEqual({ a: 'a-value', b: 'b-value' });
  });

  it('resolves a dependency before the fixture that needs it', async () => {
    const order: string[] = [];

    const dep = defineFixture<{ batchId: string }>({
      scope: 'suite',
      async setup(_deps, { use }) {
        order.push('dep-setup');
        await use({ batchId: 'batch-1' });
      },
    });
    const dependent = defineFixture<{ recordId: string }, { batchId: string }>({
      scope: 'flow',
      deps: dep,
      async setup(depsValue, { use }) {
        order.push('dependent-setup');
        await use({ recordId: `${depsValue.batchId}-0` });
      },
    });

    const resolver = new FixtureResolver();
    const { values } = await resolver.resolveForFlow([dep, dependent]);

    expect(order).toEqual(['dep-setup', 'dependent-setup']);
    expect(values).toEqual({ batchId: 'batch-1', recordId: 'batch-1-0' });
  });

  it('runs teardown (code after use()) when a Flow-scoped fixture is torn down', async () => {
    const events: string[] = [];
    const fixture = defineFixture<{ x: number }>({
      scope: 'flow',
      async setup(_deps, { use }) {
        events.push('setup');
        await use({ x: 1 });
        events.push('teardown');
      },
    });

    const resolver = new FixtureResolver();
    const { teardown } = await resolver.resolveForFlow([fixture]);
    expect(events).toEqual(['setup']);

    await teardown();
    expect(events).toEqual(['setup', 'teardown']);
  });

  it('sets up a Suite-scoped fixture once and reuses it across multiple resolveForFlow calls', async () => {
    const setup = vi.fn();
    const fixture = defineFixture<{ batchId: string }>({
      scope: 'suite',
      async setup(_deps, { use }) {
        setup();
        await use({ batchId: 'shared-batch' });
      },
    });

    const resolver = new FixtureResolver();
    const first = await resolver.resolveForFlow([fixture]);
    const second = await resolver.resolveForFlow([fixture]);

    expect(setup).toHaveBeenCalledTimes(1);
    expect(first.values).toEqual({ batchId: 'shared-batch' });
    expect(second.values).toEqual({ batchId: 'shared-batch' });
  });

  it('does not tear down a Suite-scoped fixture when a Flow-scoped teardown runs', async () => {
    const events: string[] = [];
    const suiteFixture = defineFixture<{ batchId: string }>({
      scope: 'suite',
      async setup(_deps, { use }) {
        await use({ batchId: 'b1' });
        events.push('suite-teardown');
      },
    });

    const resolver = new FixtureResolver();
    const { teardown } = await resolver.resolveForFlow([suiteFixture]);
    await teardown();

    expect(events).toEqual([]);

    await resolver.teardownSuiteScoped();
    expect(events).toEqual(['suite-teardown']);
  });

  it('accumulates and shares Flow-scoped state via a dependent fixture across two resolutions', async () => {
    interface BatchState {
      batchId: string;
      recordIds: string[];
    }

    const batchFixture: Fixture<BatchState> = defineFixture<BatchState>({
      scope: 'suite',
      async setup(_deps, { use }) {
        await use({ batchId: 'lifecycle-batch', recordIds: [] });
      },
    });

    const recordIdFixture = defineFixture<{ recordId: string }, BatchState>({
      scope: 'flow',
      deps: batchFixture,
      async setup(batch, { use }) {
        const recordId = `${batch.batchId}-${batch.recordIds.length.toString()}`;
        batch.recordIds.push(recordId);
        await use({ recordId });
      },
    });

    const resolver = new FixtureResolver();
    const seed = await resolver.resolveForFlow([batchFixture, recordIdFixture]);
    expect(seed.values).toEqual({
      batchId: 'lifecycle-batch',
      recordIds: ['lifecycle-batch-0'],
      recordId: 'lifecycle-batch-0',
    });
    await seed.teardown();

    const verify = await resolver.resolveForFlow([batchFixture]);
    expect(verify.values).toEqual({ batchId: 'lifecycle-batch', recordIds: ['lifecycle-batch-0'] });
  });
});
