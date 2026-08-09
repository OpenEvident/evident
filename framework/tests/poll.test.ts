import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { poll, PollTimeoutError } from '../src/poll.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('poll', () => {
  it('resolves with outcome "pass" when the condition passes on the first attempt', async () => {
    const condition = vi.fn().mockResolvedValue(undefined);

    const result = await poll(condition, { expectBy: '2s', timeout: '10s' });

    expect(result).toEqual({ outcome: 'pass', durationMs: 0, attempts: 1 });
    expect(condition).toHaveBeenCalledTimes(1);
  });

  it('waits out the delay before the first attempt', async () => {
    const condition = vi.fn().mockResolvedValue(undefined);

    const promise = poll(condition, { delay: '1s', expectBy: '2s', timeout: '10s' });
    expect(condition).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(condition).toHaveBeenCalledTimes(1);
  });

  it('flags a late pass as "pass-flagged-slow" once past expectBy', async () => {
    let attempt = 0;
    const condition = vi.fn().mockImplementation(() => {
      attempt += 1;
      if (attempt < 4) {
        throw new Error('not ready yet');
      }
    });

    const promise = poll(condition, { expectBy: '500ms', timeout: '10s' });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.outcome).toBe('pass-flagged-slow');
    expect(result.attempts).toBe(4);
    expect(condition).toHaveBeenCalledTimes(4);
  });

  it('throws PollTimeoutError with attempts and the last error as cause once timeout is exceeded', async () => {
    const failure = new Error('still failing');
    const condition = vi.fn().mockImplementation(() => {
      throw failure;
    });

    const promise = poll(condition, { expectBy: '200ms', timeout: '1s' });
    let caught: unknown;
    const settled = promise.catch((error: unknown) => {
      caught = error;
    });

    await vi.advanceTimersByTimeAsync(1500);
    await settled;

    expect(caught).toBeInstanceOf(PollTimeoutError);
    const timeoutError = caught as PollTimeoutError;
    expect(timeoutError.attempts).toBe(5);
    expect(timeoutError.cause).toBe(failure);
  });

  it('rejects immediately when expectBy exceeds timeout, without calling the condition', async () => {
    const condition = vi.fn();

    await expect(poll(condition, { expectBy: '10s', timeout: '5s' })).rejects.toThrow(/expectBy/);

    expect(condition).not.toHaveBeenCalled();
  });

  it('applies framework defaults when expectBy/timeout are omitted', async () => {
    const condition = vi.fn().mockResolvedValue(undefined);

    const result = await poll(condition);

    expect(result.outcome).toBe('pass');
  });
});
