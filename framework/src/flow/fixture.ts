import type { Evidence } from '../evidence/evidence.js';
import type { Trigger } from '../evidence/trigger.js';

export interface FixtureContext<T> {
  use: (value: T) => Promise<void>;
  /**
   * Only populated for `scope: 'flow'` Fixtures — resolved fresh per Flow,
   * bound to that Flow's own fire-offset window. Never populated for
   * `scope: 'suite'` Fixtures: a Suite-scoped Fixture's `setup` runs once
   * and is reused across every Flow in the Suite, so a `trigger`/`evidence`
   * captured there would silently point at the *first* Flow's window for
   * every later Flow — exactly the stale-match bug per-Flow fire-offset
   * scoping exists to prevent (architecture.md §5). A Fixture that needs
   * to make trigger calls or read evidence (e.g. binding a service's
   * client methods) must declare `scope: 'flow'`.
   */
  trigger?: Trigger;
  evidence?: Evidence;
}

export interface Fixture<T, Deps = unknown> {
  scope: 'flow' | 'suite';
  auto?: boolean;
  deps?: Fixture<Deps>;
  setup(deps: Deps, ctx: FixtureContext<T>): Promise<void>;
}

/**
 * Declares a Fixture: a paired setup/teardown for a resource a Flow can
 * request, split by a single `use(value)` call inside `setup` — code
 * before it is setup, code after it is teardown (docs/flow-model.md §5).
 */
export function defineFixture<T, Deps = unknown>(fixture: Fixture<T, Deps>): Fixture<T, Deps> {
  return fixture;
}
