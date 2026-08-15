import { expect as jestExpect } from 'expect';
import { describe, it } from 'vitest';
import '../src/evidence/custom-matchers.js';

describe('toContainItem', () => {
  it('passes when an array item matches every predicate field', () => {
    jestExpect([
      { productId: 'p-1', name: 'a' },
      { productId: 'p-42', name: 'b' },
    ]).toContainItem({ productId: 'p-42' });
  });

  it('requires every predicate field to match, not just one', () => {
    jestExpect(() => {
      jestExpect([{ productId: 'p-42', status: 'DRAFT' }]).toContainItem({
        productId: 'p-42',
        status: 'PUBLISHED',
      });
    }).toThrow();
  });

  it('fails with a message naming the predicate when nothing matches', () => {
    jestExpect(() => {
      jestExpect([{ productId: 'p-1' }]).toContainItem({ productId: 'p-42' });
    }).toThrow(/productId.*p-42/);
  });

  it('fails with a clear message when the received value is not an array', () => {
    jestExpect(() => {
      jestExpect('not-an-array').toContainItem({ productId: 'p-42' });
    }).toThrow(/expected an array/);
  });

  it('supports the negated form via .not', () => {
    jestExpect([{ productId: 'p-1' }]).not.toContainItem({ productId: 'p-42' });
  });
});
