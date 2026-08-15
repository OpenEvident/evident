import { describe, expect, it } from 'vitest';
import { findItem, requireDefined } from '../src/require.js';

describe('requireDefined', () => {
  it('returns the value when defined', () => {
    expect(requireDefined('x', 'unreachable')).toBe('x');
  });

  it('returns a defined falsy value rather than treating it as missing', () => {
    expect(requireDefined(0, 'unreachable')).toBe(0);
    expect(requireDefined('', 'unreachable')).toBe('');
  });

  it('throws the given message when undefined', () => {
    expect(() => {
      requireDefined(undefined, 'expected a value');
    }).toThrow('expected a value');
  });
});

describe('findItem', () => {
  interface Item {
    id: string;
  }

  it('returns the first item matching the predicate', () => {
    const items: Item[] = [{ id: 'a' }, { id: 'b' }];
    expect(findItem(items, (item) => item.id === 'b')).toEqual({ id: 'b' });
  });

  it('throws a custom message when nothing matches', () => {
    expect(() => findItem<Item>([], (item) => item.id === 'z', 'no item')).toThrow('no item');
  });

  it('throws a default message naming the array length when no message is given', () => {
    expect(() => findItem<Item>([{ id: 'a' }, { id: 'b' }], (item) => item.id === 'z')).toThrow(
      /array of 2/,
    );
  });
});
