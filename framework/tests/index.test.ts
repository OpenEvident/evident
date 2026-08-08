import { describe, expect, it } from 'vitest';
import { version } from '../src/index.js';

describe('version', () => {
  it('returns the current package version', () => {
    expect(version()).toBe('0.0.1');
  });
});
