import type { Evidence } from '../evidence/evidence.js';
import type { Trigger } from '../evidence/trigger.js';
import { defineFixture, type Fixture } from './fixture.js';

export interface ServiceClientContext {
  trigger: Trigger;
  evidence: Evidence;
}

/**
 * Builds a `scope: 'flow'` Fixture that binds a service-client object
 * under `key` to this Flow's own `trigger`/`evidence`
 * (`fixture.ts`'s `FixtureContext` doc explains why this must stay
 * `'flow'`, never `'suite'` — a Suite-scoped Fixture's `setup` runs once
 * and would hand every later Flow a stale, wrong-window `trigger`/
 * `evidence`). Removes the boilerplate a hand-written client-binding
 * Fixture otherwise repeats per service: the scope declaration, the
 * trigger/evidence-missing guard, and the `{ [key]: ... }` wrap the
 * Fixture-value merge semantics need so the client's methods land under
 * `fixtures.<key>` instead of flattening directly into `fixtures`.
 */
/**
 * `Key extends string` (not a bare `string` parameter) is deliberate — it's
 * what makes TypeScript infer `key`'s literal type (e.g. `'menuService'`)
 * instead of widening it to `string`. That's what keeps two Flows'
 * `defineServiceClientFixture(...)` calls composable: `Record<Key, TClient>`
 * for two different literal keys intersects to `{ menuService: A } & {
 * publishing: B }` when a Flow lists both fixtures — a plain `Record<string,
 * TClient>` would instead intersect two same-shaped index signatures across
 * *every* string key, corrupting both clients' types the moment a Flow used
 * more than one.
 */
export function defineServiceClientFixture<Key extends string, TClient>(
  key: Key,
  factory: (ctx: ServiceClientContext) => TClient,
): Fixture<Record<Key, TClient>> {
  return defineFixture<Record<Key, TClient>>({
    scope: 'flow',
    async setup(_deps, { use, trigger, evidence }) {
      if (!trigger || !evidence) {
        throw new Error(
          `"${key}" service-client fixture requires a Flow-scoped context (trigger/evidence).`,
        );
      }
      await use({ [key]: factory({ trigger, evidence }) } as Record<Key, TClient>);
    },
  });
}
