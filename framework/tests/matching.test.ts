import { describe, expect, it } from 'vitest';
import { DuplicateMatchError, findMatches } from '../src/evidence/matching.js';

describe('findMatches', () => {
  it('returns undefined when nothing matches', () => {
    expect(
      findMatches('startup line\nother line', 'processed record r1', undefined, 1),
    ).toBeUndefined();
  });

  it('matches via substring when the line is not JSON', () => {
    const result = findMatches('processed record r1', 'processed record r1', undefined, 1);

    expect(result).toEqual({ matchedVia: 'substring', matchCount: 1 });
  });

  it('matches via substring when the line is JSON but matchOn is not declared', () => {
    const text = '{"recordId":"r1","msg":"processed record r1"}';

    const result = findMatches(text, 'processed record r1', undefined, 1);

    expect(result).toEqual({ matchedVia: 'substring', matchCount: 1 });
  });

  it('matches via structured-field when the line is JSON and all matchOn fields are exact', () => {
    const text = '{"recordId":"r1","eventType":"order.created","msg":"processed record r1"}';

    const result = findMatches(
      text,
      'processed record r1',
      [
        { field: 'recordId', value: 'r1' },
        { field: 'eventType', value: 'order.created' },
      ],
      1,
    );

    expect(result).toEqual({ matchedVia: 'structured-field', matchCount: 1 });
  });

  it('does not fall back to substring when a JSON line has some but not all matchOn fields', () => {
    const text = '{"recordId":"r1","eventType":"order.updated","msg":"processed record r1"}';

    const result = findMatches(
      text,
      'processed record r1',
      [
        { field: 'recordId', value: 'r1' },
        { field: 'eventType', value: 'order.created' },
      ],
      1,
    );

    expect(result).toBeUndefined();
  });

  it('matches via trace-id when a structured match also carries a non-empty trace_id field', () => {
    const text = '{"recordId":"r1","trace_id":"abc123","msg":"processed record r1"}';

    const result = findMatches(
      text,
      'processed record r1',
      [{ field: 'recordId', value: 'r1' }],
      1,
    );

    expect(result).toEqual({ matchedVia: 'trace-id', matchCount: 1 });
  });

  it('ignores an empty trace_id field, still reporting structured-field', () => {
    const text = '{"recordId":"r1","trace_id":"","msg":"processed record r1"}';

    const result = findMatches(
      text,
      'processed record r1',
      [{ field: 'recordId', value: 'r1' }],
      1,
    );

    expect(result).toEqual({ matchedVia: 'structured-field', matchCount: 1 });
  });

  it('reports the strongest matchedVia across multiple matching lines when expectedMatches allows it', () => {
    const text = [
      'processed record r1',
      '{"recordId":"r1","trace_id":"abc123","msg":"processed record r1"}',
    ].join('\n');

    const result = findMatches(
      text,
      'processed record r1',
      [{ field: 'recordId', value: 'r1' }],
      'any',
    );

    expect(result).toEqual({ matchedVia: 'trace-id', matchCount: 2 });
  });

  it('throws DuplicateMatchError when more than expectedMatches lines match and matchOn is declared', () => {
    const text = [
      '{"recordId":"r1","msg":"processed record r1"}',
      '{"recordId":"r1","msg":"processed record r1 again"}',
    ].join('\n');

    expect(() =>
      findMatches(text, 'processed record r1', [{ field: 'recordId', value: 'r1' }], 1),
    ).toThrow(DuplicateMatchError);
  });

  it('does not throw for duplicates when matchOn is not declared', () => {
    const text = 'processed record r1\nprocessed record r1 again';

    const result = findMatches(text, 'processed record r1', undefined, 1);

    expect(result).toEqual({ matchedVia: 'substring', matchCount: 2 });
  });

  it('does not throw for duplicates when expectedMatches is "any"', () => {
    const text = [
      '{"recordId":"r1","msg":"a"}',
      '{"recordId":"r1","msg":"b"}',
      '{"recordId":"r1","msg":"c"}',
    ].join('\n');

    const result = findMatches(text, 'irrelevant', [{ field: 'recordId', value: 'r1' }], 'any');

    expect(result).toEqual({ matchedVia: 'structured-field', matchCount: 3 });
  });

  it('DuplicateMatchError carries matchCount and expectedMatches', () => {
    const text = [
      '{"recordId":"r1","msg":"a"}',
      '{"recordId":"r1","msg":"b"}',
      '{"recordId":"r1","msg":"c"}',
    ].join('\n');

    try {
      findMatches(text, 'irrelevant', [{ field: 'recordId', value: 'r1' }], 1);
      expect.unreachable('expected findMatches to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DuplicateMatchError);
      const duplicateError = error as DuplicateMatchError;
      expect(duplicateError.matchCount).toBe(3);
      expect(duplicateError.expectedMatches).toBe(1);
    }
  });

  it('ignores blank lines', () => {
    const result = findMatches('\n\nprocessed record r1\n\n', 'processed record r1', undefined, 1);

    expect(result).toEqual({ matchedVia: 'substring', matchCount: 1 });
  });

  it('treats a JSON array line as non-object, falling back to substring', () => {
    const text = '["r1","processed record r1"]';

    const result = findMatches(
      text,
      'processed record r1',
      [{ field: 'recordId', value: 'r1' }],
      1,
    );

    expect(result).toEqual({ matchedVia: 'substring', matchCount: 1 });
  });
});
