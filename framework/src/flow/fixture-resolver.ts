import type { Evidence } from '../evidence/evidence.js';
import type { Trigger } from '../evidence/trigger.js';
import type { Fixture } from './fixture.js';

/** The running Flow's `trigger`/`evidence`, passed to `scope: 'flow'` Fixtures only (see fixture.ts's `FixtureContext` doc for why). */
export interface FixtureRunContext {
  trigger: Trigger;
  evidence: Evidence;
}

interface ResolvedFixture {
  value: unknown;
  teardown: () => Promise<void>;
}

function runFixture<T, Deps>(
  fixture: Fixture<T, Deps>,
  deps: Deps,
  runContext: FixtureRunContext,
): Promise<ResolvedFixture> {
  let resolveReady!: (value: T) => void;
  const ready = new Promise<T>((resolve) => {
    resolveReady = resolve;
  });

  let releaseTeardown!: () => void;
  const canTeardown = new Promise<void>((resolve) => {
    releaseTeardown = resolve;
  });

  const setupPromise = fixture.setup(deps, {
    async use(value: T) {
      resolveReady(value);
      await canTeardown;
    },
    ...(fixture.scope === 'flow'
      ? { trigger: runContext.trigger, evidence: runContext.evidence }
      : {}),
  });

  return ready.then((value) => ({
    value,
    async teardown() {
      releaseTeardown();
      await setupPromise;
    },
  }));
}

function mergeFixtureValue(
  target: Record<string, unknown>,
  value: unknown,
): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return { ...target, ...value };
  }
  return target;
}

/**
 * Resolves and tears down Fixtures for one Suite run. Suite-scoped
 * Fixtures are set up once and shared across every Flow that requests
 * them; Flow-scoped Fixtures are set up fresh per Flow. A Fixture's
 * `deps` (if declared) is resolved first and passed as its `setup`'s
 * first argument (docs/flow-model.md §5).
 */
export class FixtureResolver {
  private readonly suiteScoped = new Map<Fixture<unknown>, ResolvedFixture>();

  private async resolveOne(
    fixture: Fixture<unknown>,
    flowScoped: ResolvedFixture[],
    runContext: FixtureRunContext,
  ): Promise<unknown> {
    if (fixture.scope === 'suite') {
      const cached = this.suiteScoped.get(fixture);
      if (cached) {
        return cached.value;
      }
      const deps = fixture.deps
        ? await this.resolveOne(fixture.deps, flowScoped, runContext)
        : undefined;
      const resolved = await runFixture(fixture, deps, runContext);
      this.suiteScoped.set(fixture, resolved);
      return resolved.value;
    }

    const deps = fixture.deps
      ? await this.resolveOne(fixture.deps, flowScoped, runContext)
      : undefined;
    const resolved = await runFixture(fixture, deps, runContext);
    flowScoped.push(resolved);
    return resolved.value;
  }

  /**
   * Resolves every Fixture a single Flow requests, merging their values
   * into one object. `runContext` is that Flow's own `trigger`/`evidence` —
   * only ever handed to a `scope: 'flow'` Fixture's `setup` (see
   * `FixtureContext`'s doc comment for why a Suite-scoped Fixture never
   * gets them).
   */
  async resolveForFlow(
    fixtures: readonly Fixture<unknown>[],
    runContext: FixtureRunContext,
  ): Promise<{ values: Record<string, unknown>; teardown: () => Promise<void> }> {
    const flowScoped: ResolvedFixture[] = [];
    let values: Record<string, unknown> = {};

    for (const fixture of fixtures) {
      const value = await this.resolveOne(fixture, flowScoped, runContext);
      values = mergeFixtureValue(values, value);
    }

    return {
      values,
      teardown: async () => {
        for (const resolved of flowScoped.slice().reverse()) {
          await resolved.teardown();
        }
      },
    };
  }

  /** Tears down every Suite-scoped Fixture that was set up. Call once, after every Flow in the Suite has finished. */
  async teardownSuiteScoped(): Promise<void> {
    for (const resolved of [...this.suiteScoped.values()].reverse()) {
      await resolved.teardown();
    }
    this.suiteScoped.clear();
  }
}
