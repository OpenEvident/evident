import type { CorrelationMode } from '../config.js';
import type { Evidence } from '../evidence/evidence.js';
import { poll } from '../evidence/poll.js';
import type { Trigger } from '../evidence/trigger.js';
import type { Fixture } from './fixture.js';

export type SafetyLevel = 'safe' | 'ask-first';

export interface FlowContext<Fixtures = Record<string, never>> {
  trigger: Trigger;
  evidence: Evidence;
  poll: typeof poll;
  fixtures: Fixtures;
}

export interface Flow {
  name: string;
  services: readonly string[];
  safety: SafetyLevel;
  correlation: CorrelationMode;
  /** For `evident run --tag`. */
  tags?: string[];
  /** Disables the Flow without deleting it. A string doubles as a self-documenting reason, visible in run summaries. */
  skip?: boolean | string;
  /** Named lock — Flows sharing a lock name never run concurrently, even across Suites (flow-model.md §7). Opt-in only, never inferred. */
  lock?: string;
  /** Ceiling on the whole `run()`, independent of any individual `poll()` call's own timeout (flow-model.md §10.1). */
  timeout?: string;
  /** Off by default. A Flow that fails then passes on retry records a distinct "pass-after-retry" outcome, never a silent clean pass (flow-model.md §10.2). */
  retries?: number;
  fixtures?: readonly Fixture<unknown>[];
  run(context: FlowContext<Record<string, unknown>>): Promise<void>;
}

type FixtureValue<F> = F extends Fixture<infer T> ? T : never;

/**
 * The standard TS "distribute over a union, then collapse to an
 * intersection" trick — turns "each fixture contributes value A, B, C"
 * into "the merged fixtures object has A & B & C", which is what a Flow
 * author actually sees when destructuring `fixtures` inside `run()`.
 */
type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never;

type MergedFixtureValues<Fixtures extends readonly Fixture<unknown>[]> =
  Fixtures extends readonly []
    ? Record<string, never>
    : UnionToIntersection<FixtureValue<Fixtures[number]>>;

export interface FlowDefinition<Fixtures extends readonly Fixture<unknown>[] = []> {
  name: string;
  services: readonly string[];
  safety: SafetyLevel;
  correlation: CorrelationMode;
  tags?: string[];
  skip?: boolean | string;
  lock?: string;
  timeout?: string;
  retries?: number;
  fixtures?: Fixtures;
  run(context: FlowContext<MergedFixtureValues<Fixtures>>): Promise<void>;
}

/**
 * Declares a Flow: static metadata (readable without executing anything)
 * plus an imperative body. `fixtures`' declared types are merged and
 * exposed as `run()`'s `fixtures` context param — the returned `Flow`
 * itself stores that param with its types erased, since a Suite holds a
 * heterogeneous array of Flows the runner must treat uniformly.
 */
export function defineFlow<const Fixtures extends readonly Fixture<unknown>[] = []>(
  flow: FlowDefinition<Fixtures>,
): Flow {
  return flow as unknown as Flow;
}
