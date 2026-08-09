import { describe, expect, it } from 'vitest';
import { parseDuration } from '../src/duration.js';

describe('parseDuration', () => {
  it('parses milliseconds', () => {
    expect(parseDuration('500ms')).toBe(500);
  });

  it('parses seconds', () => {
    expect(parseDuration('2s')).toBe(2000);
  });

  it('parses minutes', () => {
    expect(parseDuration('5m')).toBe(300_000);
  });

  it('parses hours', () => {
    expect(parseDuration('1h')).toBe(3_600_000);
  });

  it('parses fractional values', () => {
    expect(parseDuration('1.5s')).toBe(1500);
  });

  it('throws on an unrecognized unit', () => {
    expect(() => parseDuration('5d')).toThrow(/Invalid duration/);
  });

  it('throws on a missing unit', () => {
    expect(() => parseDuration('500')).toThrow(/Invalid duration/);
  });

  it('throws on garbage input', () => {
    expect(() => parseDuration('soon')).toThrow(/Invalid duration/);
  });
});
