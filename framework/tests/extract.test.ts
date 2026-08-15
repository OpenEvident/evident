import { describe, expect, it } from 'vitest';
import { extractBoolean, extractNumber, extractString } from '../src/evidence/extract.js';

describe('extractString', () => {
  it('returns the field when it is a string', () => {
    expect(extractString({ productId: 'p-42' }, 'productId')).toBe('p-42');
  });

  it('throws a descriptive error when the record is undefined', () => {
    expect(() => extractString(undefined, 'productId')).toThrow(/undefined/);
  });

  it('throws a descriptive error when the field is missing', () => {
    expect(() => extractString({ other: 'x' }, 'productId')).toThrow(/productId/);
  });

  it('throws a descriptive error when the field is the wrong type', () => {
    expect(() => extractString({ productId: 42 }, 'productId')).toThrow(/string/);
  });
});

describe('extractNumber', () => {
  it('returns the field when it is a number', () => {
    expect(extractNumber({ count: 3 }, 'count')).toBe(3);
  });

  it('throws when the field is a string, not a number', () => {
    expect(() => extractNumber({ count: '3' }, 'count')).toThrow(/number/);
  });
});

describe('extractBoolean', () => {
  it('returns the field when it is a boolean', () => {
    expect(extractBoolean({ active: true }, 'active')).toBe(true);
  });

  it('throws when the field is missing', () => {
    expect(() => extractBoolean({}, 'active')).toThrow(/active/);
  });
});
