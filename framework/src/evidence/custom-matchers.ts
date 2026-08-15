import { expect } from 'expect';

type ItemPredicate = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function itemMatches(item: unknown, predicate: ItemPredicate): boolean {
  return isRecord(item) && Object.entries(predicate).every(([key, value]) => item[key] === value);
}

/**
 * Registers `toContainItem` on the `expect` package Flow authors get via
 * `import { expect } from 'evident'` — the standalone `expect` package
 * (architecture.md Decision 17), not vitest's own separate `expect`.
 * Extends the sanctioned matcher vocabulary instead of inventing parallel
 * comparison syntax (`.claude/rules/evidence-layer.md`). Runs once, as a
 * side effect of importing this module (`index.ts` does so on load);
 * calling it again is harmless — `expect.extend` just re-registers the
 * same matcher under the same name.
 */
export function registerCustomMatchers(): void {
  expect.extend({
    toContainItem(received: unknown, predicate: ItemPredicate) {
      if (!Array.isArray(received)) {
        return { pass: false, message: () => `expected an array, received ${typeof received}` };
      }

      const pass = received.some((item) => itemMatches(item, predicate));
      return {
        pass,
        message: () =>
          pass
            ? `expected the array not to contain an item matching ${JSON.stringify(predicate)}`
            : `expected the array to contain an item matching ${JSON.stringify(predicate)}, received ${JSON.stringify(received)}`,
      };
    },
  });
}

registerCustomMatchers();

declare module 'expect' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match Matchers<R, T>'s exact signature for declaration merging; T isn't needed by toContainItem itself.
  interface Matchers<R extends void | Promise<void>, T = unknown> {
    /** Asserts the array has at least one item whose declared fields all equal `predicate`'s. */
    toContainItem(predicate: Record<string, unknown>): R;
  }
}
