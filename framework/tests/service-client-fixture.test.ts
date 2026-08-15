import { describe, expect, it, vi } from 'vitest';
import type { Evidence } from '../src/evidence/evidence.js';
import type { Trigger, TriggerResponse } from '../src/evidence/trigger.js';
import { FixtureResolver } from '../src/flow/fixture-resolver.js';
import { defineServiceClientFixture } from '../src/flow/service-client-fixture.js';

const stubTrigger: Trigger = {
  api: <TBody>() => Promise.resolve({ status: 200, body: undefined } as TriggerResponse<TBody>),
};
const stubEvidence: Evidence = {
  logs: () => ({
    waitFor: () => Promise.resolve({ outcome: 'pass', durationMs: 0, attempts: 1 } as const),
    contains: () => Promise.resolve(false),
  }),
};

describe('defineServiceClientFixture', () => {
  it('binds the factory-built client under the given key', async () => {
    const clientFixture = defineServiceClientFixture('menuService', ({ trigger }) => ({
      ping: () => trigger.api('menu-service', { method: 'GET', path: '/ping' }),
    }));

    const resolver = new FixtureResolver();
    const { values } = await resolver.resolveForFlow([clientFixture], {
      trigger: stubTrigger,
      evidence: stubEvidence,
    });

    expect(values).toHaveProperty('menuService');
    const menuService = (values as { menuService: { ping: () => Promise<unknown> } }).menuService;
    await expect(menuService.ping()).resolves.toEqual({ status: 200, body: undefined });
  });

  it('passes the exact trigger/evidence it was given to the factory', async () => {
    let seenTrigger: Trigger | undefined;
    let seenEvidence: Evidence | undefined;
    const clientFixture = defineServiceClientFixture('svc', (ctx) => {
      seenTrigger = ctx.trigger;
      seenEvidence = ctx.evidence;
      return {};
    });

    const resolver = new FixtureResolver();
    await resolver.resolveForFlow([clientFixture], {
      trigger: stubTrigger,
      evidence: stubEvidence,
    });

    expect(seenTrigger).toBe(stubTrigger);
    expect(seenEvidence).toBe(stubEvidence);
  });

  it('is Flow-scoped, so it is set up fresh on every resolveForFlow call', async () => {
    const setupCalls = vi.fn();
    const clientFixture = defineServiceClientFixture('svc', () => {
      setupCalls();
      return {};
    });

    const resolver = new FixtureResolver();
    await resolver.resolveForFlow([clientFixture], {
      trigger: stubTrigger,
      evidence: stubEvidence,
    });
    await resolver.resolveForFlow([clientFixture], {
      trigger: stubTrigger,
      evidence: stubEvidence,
    });

    expect(setupCalls).toHaveBeenCalledTimes(2);
  });

  it('keeps two different clients’ keys distinct when a Flow lists both fixtures', async () => {
    const menuServiceFixture = defineServiceClientFixture('menuService', () => ({
      createMenu: () => 'menu-created',
    }));
    const publishingFixture = defineServiceClientFixture('publishing', () => ({
      publishMenu: () => 'menu-published',
    }));

    const resolver = new FixtureResolver();
    const { values } = await resolver.resolveForFlow([menuServiceFixture, publishingFixture], {
      trigger: stubTrigger,
      evidence: stubEvidence,
    });

    const typed = values as {
      menuService: { createMenu: () => string };
      publishing: { publishMenu: () => string };
    };
    expect(typed.menuService.createMenu()).toBe('menu-created');
    expect(typed.publishing.publishMenu()).toBe('menu-published');
  });
});
