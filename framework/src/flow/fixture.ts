export interface FixtureContext<T> {
  use: (value: T) => Promise<void>;
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
