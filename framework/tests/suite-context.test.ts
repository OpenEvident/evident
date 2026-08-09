import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  afterAll,
  afterEach as suiteAfterEach,
  beforeAll,
  beforeEach as suiteBeforeEach,
  beginSuiteRegistration,
  configureSuite,
  endSuiteRegistration,
} from '../src/flow/suite-context.js';

/**
 * Guards against one failing test leaving an open registration that leaks
 * into the next test.
 */
afterEach(() => {
  try {
    endSuiteRegistration();
  } catch {
    // No open registration — nothing to clean up.
  }
});

describe('suite-context', () => {
  it('collects hooks and mode registered between begin/end', () => {
    beginSuiteRegistration();

    const onBeforeAll = vi.fn();
    const onAfterAll = vi.fn();
    const onBeforeEach = vi.fn();
    const onAfterEach = vi.fn();

    beforeAll(onBeforeAll);
    afterAll(onAfterAll);
    suiteBeforeEach(onBeforeEach);
    suiteAfterEach(onAfterEach);
    configureSuite({ mode: 'serial' });

    const registration = endSuiteRegistration();

    expect(registration.hooks.beforeAll).toEqual([onBeforeAll]);
    expect(registration.hooks.afterAll).toEqual([onAfterAll]);
    expect(registration.hooks.beforeEach).toEqual([onBeforeEach]);
    expect(registration.hooks.afterEach).toEqual([onAfterEach]);
    expect(registration.mode).toBe('serial');
  });

  it('defaults mode to undefined (sequential) when configureSuite is never called', () => {
    beginSuiteRegistration();
    const registration = endSuiteRegistration();
    expect(registration.mode).toBeUndefined();
  });

  it('supports multiple hooks of the same kind, in registration order', () => {
    beginSuiteRegistration();
    const first = vi.fn();
    const second = vi.fn();
    beforeAll(first);
    beforeAll(second);
    const registration = endSuiteRegistration();
    expect(registration.hooks.beforeAll).toEqual([first, second]);
  });

  it('resets cleanly between independent registration windows', () => {
    beginSuiteRegistration();
    beforeAll(vi.fn());
    endSuiteRegistration();

    beginSuiteRegistration();
    const registration = endSuiteRegistration();
    expect(registration.hooks.beforeAll).toEqual([]);
  });

  it('throws if a hook is registered with no open registration window', () => {
    expect(() => {
      beforeAll(vi.fn());
    }).toThrow(/must be called at the top level/);
  });

  it('throws if endSuiteRegistration is called with no open window', () => {
    expect(() => endSuiteRegistration()).toThrow(/without a matching beginSuiteRegistration/);
  });
});
