export type HookFn = () => void | Promise<void>;

export type SuiteMode = 'parallel' | 'serial';

export interface SuiteRegistration {
  hooks: {
    beforeAll: HookFn[];
    afterAll: HookFn[];
    beforeEach: HookFn[];
    afterEach: HookFn[];
  };
  mode?: SuiteMode;
}

let current: SuiteRegistration | null = null;

function emptyRegistration(): SuiteRegistration {
  return { hooks: { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] } };
}

/**
 * Opens a Suite registration window — call before dynamically importing a
 * `.flow.ts` file, so any `beforeAll`/`afterAll`/`beforeEach`/`afterEach`/
 * `configureSuite` calls made at that file's module top level attach to
 * this registration instead of having no effect.
 */
export function beginSuiteRegistration(): void {
  current = emptyRegistration();
}

/** Closes the window opened by {@link beginSuiteRegistration} and returns what was collected. */
export function endSuiteRegistration(): SuiteRegistration {
  if (!current) {
    throw new Error('endSuiteRegistration() called without a matching beginSuiteRegistration().');
  }
  const registration = current;
  current = null;
  return registration;
}

function activeRegistration(caller: string): SuiteRegistration {
  if (!current) {
    throw new Error(
      `${caller}() must be called at the top level of a Flow Suite file while it's being loaded by the runner — it has no effect otherwise.`,
    );
  }
  return current;
}

export function beforeAll(fn: HookFn): void {
  activeRegistration('beforeAll').hooks.beforeAll.push(fn);
}

export function afterAll(fn: HookFn): void {
  activeRegistration('afterAll').hooks.afterAll.push(fn);
}

export function beforeEach(fn: HookFn): void {
  activeRegistration('beforeEach').hooks.beforeEach.push(fn);
}

export function afterEach(fn: HookFn): void {
  activeRegistration('afterEach').hooks.afterEach.push(fn);
}

/** Sets the Suite's execution mode. Sequential (declared order) is the default — call this only to opt into `'parallel'` or `'serial'` (flow-model.md §6). */
export function configureSuite(config: { mode: SuiteMode }): void {
  activeRegistration('configureSuite').mode = config.mode;
}
