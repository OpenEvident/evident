import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedService } from '../src/config.js';
import { createTrigger, TriggerError } from '../src/evidence/trigger.js';

const services: Record<string, ResolvedService> = {
  'caller-service': {
    name: 'caller-service',
    baseUrl: 'http://localhost:8081',
    logPath: '/logs/caller.log',
    correlation: 'heuristic',
  },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createTrigger', () => {
  it('returns the parsed response on a 2xx status', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'completed' }), { status: 200 }),
    );

    const trigger = createTrigger(services, vi.fn());
    const res = await trigger.api('caller-service', {
      method: 'POST',
      path: '/trigger',
      body: { recordId: 'r1' },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'completed' });
  });

  it('sends a JSON body with the right headers when a body is provided', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const trigger = createTrigger(services, vi.fn());
    await trigger.api('caller-service', {
      method: 'POST',
      path: '/trigger',
      body: { recordId: 'r1' },
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8081/trigger',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: 'r1' }),
      }),
    );
  });

  it('throws TriggerError on a non-2xx status', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'failed' }), { status: 500 }),
    );

    const trigger = createTrigger(services, vi.fn());

    await expect(
      trigger.api('caller-service', { method: 'POST', path: '/trigger' }),
    ).rejects.toThrow(TriggerError);
  });

  it('calls onFire exactly once, before the first request', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const onFire = vi.fn().mockResolvedValue(undefined);
    const trigger = createTrigger(services, onFire);

    await trigger.api('caller-service', { method: 'GET', path: '/a' });
    await trigger.api('caller-service', { method: 'GET', path: '/b' });

    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('rejects for a service not declared for this Flow', async () => {
    const trigger = createTrigger(services, vi.fn());

    await expect(trigger.api('unknown-service', { method: 'GET', path: '/x' })).rejects.toThrow(
      /Unknown service/,
    );
  });
});
