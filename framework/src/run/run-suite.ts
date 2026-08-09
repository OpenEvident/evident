import { randomUUID } from 'node:crypto';
import type { EvidentConfig } from '../config.js';
import type { Flow } from '../flow/define-flow.js';
import { FixtureResolver } from '../flow/fixture-resolver.js';
import type { SuiteRegistration } from '../flow/suite-context.js';
import { LockCoordinator } from './lock-coordinator.js';
import type { RunBundle } from './run-bundle.js';
import { runFlow } from './run-flow.js';

export interface SkippedFlow {
  name: string;
  reason: string;
}

export interface SuiteRunResult {
  suiteRunId: string;
  bundles: RunBundle[];
  skipped: SkippedFlow[];
}

export interface RunSuiteOptions {
  target?: string;
}

function skipReason(flow: Flow): string {
  return typeof flow.skip === 'string' ? flow.skip : 'marked skip';
}

/**
 * Runs every Flow collected from one Suite file, honoring its registered
 * hooks and execution mode (`beginSuiteRegistration`/`endSuiteRegistration`
 * in suite-context.ts collect these while the file is being imported).
 *
 * Sequential (default) and parallel modes run every non-skipped Flow.
 * Serial mode stops at the first failure and records every Flow after it
 * as skipped, per flow-model.md §6. Suite-scoped Fixtures and named locks
 * are shared across every Flow in this call; every bundle produced carries
 * the same `suiteRunId`.
 */
export async function runSuite(
  flows: readonly Flow[],
  registration: SuiteRegistration,
  config: EvidentConfig,
  options: RunSuiteOptions = {},
): Promise<SuiteRunResult> {
  const suiteRunId = randomUUID();
  const resolver = new FixtureResolver();
  const lockCoordinator = new LockCoordinator();

  const runnable: Flow[] = [];
  const skipped: SkippedFlow[] = [];
  for (const flow of flows) {
    if (flow.skip) {
      skipped.push({ name: flow.name, reason: skipReason(flow) });
    } else {
      runnable.push(flow);
    }
  }

  for (const hook of registration.hooks.beforeAll) {
    await hook();
  }

  const runOne = async (flow: Flow): Promise<RunBundle> => {
    for (const hook of registration.hooks.beforeEach) {
      await hook();
    }
    const runFlowOptions: Parameters<typeof runFlow>[2] = { fixtureResolver: resolver };
    if (options.target !== undefined) {
      runFlowOptions.target = options.target;
    }
    const bundle = await lockCoordinator.run(flow.lock, () =>
      runFlow(flow, config, runFlowOptions),
    );
    bundle.suiteRunId = suiteRunId;
    for (const hook of registration.hooks.afterEach) {
      await hook();
    }
    return bundle;
  };

  const bundles: RunBundle[] = [];

  if (registration.mode === 'parallel') {
    bundles.push(...(await Promise.all(runnable.map(runOne))));
  } else if (registration.mode === 'serial') {
    for (let i = 0; i < runnable.length; i += 1) {
      const flow = runnable[i];
      if (!flow) {
        continue;
      }
      const bundle = await runOne(flow);
      bundles.push(bundle);
      if (bundle.outcome === 'fail') {
        for (const remaining of runnable.slice(i + 1)) {
          skipped.push({
            name: remaining.name,
            reason: `skipped — an earlier Flow ("${flow.name}") in this serial group failed`,
          });
        }
        break;
      }
    }
  } else {
    for (const flow of runnable) {
      bundles.push(await runOne(flow));
    }
  }

  for (const hook of registration.hooks.afterAll) {
    await hook();
  }

  await resolver.teardownSuiteScoped();

  return { suiteRunId, bundles, skipped };
}
