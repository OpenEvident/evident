import { NonRetryableError } from './poll.js';

/** One field/value pair to require, exactly, on a JSON-parseable log line. Combine several in `matchOn` — all are AND'd. */
export interface MatchOnField {
  field: string;
  value: string;
}

/**
 * Which rung of the search matched (architecture.md §5): `'substring'` is
 * a plain text scan (works against any log line, but only as strong as the
 * literal text happening to appear); `'structured-field'` is an exact key
 * lookup against a JSON-parsed line's declared `matchOn` fields
 * (deterministic — the field either exists with that value or it doesn't);
 * `'trace-id'` is a `structured-field` match whose line also carries a
 * non-empty `trace_id`, the strongest signal available without switching
 * to full `trace` correlation mode.
 */
export type MatchedVia = 'substring' | 'structured-field' | 'trace-id';

export interface MatchResult {
  matchedVia: MatchedVia;
  /** How many lines matched within the search window — always `1` once past `expectedMatches` enforcement, but useful when `expectedMatches: 'any'` bypasses it. */
  matchCount: number;
  /**
   * The matched line's parsed JSON payload, for a `structured-field` or
   * `trace-id` match. Absent for a `substring` match — there's no parsed
   * object to return in that case.
   */
  record?: Record<string, unknown>;
}

interface LineMatch {
  matchedVia: MatchedVia;
  record: Record<string, unknown> | undefined;
}

/**
 * Thrown when more lines match than `expectedMatches` allows. A duplicate
 * is a fact about evidence that already exists in an append-only log —
 * more polling can never undo it, so it's surfaced immediately as its own
 * failure kind instead of being retried into a confusing timeout.
 */
export class DuplicateMatchError extends NonRetryableError {
  readonly matchCount: number;
  readonly expectedMatches: number;

  constructor(matchCount: number, expectedMatches: number) {
    super(
      `Found ${matchCount.toString()} matches, expected exactly ${expectedMatches.toString()}.`,
    );
    this.name = 'DuplicateMatchError';
    this.matchCount = matchCount;
    this.expectedMatches = expectedMatches;
  }
}

const MATCH_STRENGTH: Record<MatchedVia, number> = {
  substring: 0,
  'structured-field': 1,
  'trace-id': 2,
};

function parseJsonObject(line: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `matchOn` fields are checked structurally, never as a substring fallback,
 * even on a JSON line where every field mismatches — falling back would
 * reopen the exact false-positive risk `matchOn` exists to close.
 */
function matchLine(
  line: string,
  pattern: string,
  matchOn: readonly MatchOnField[] | undefined,
): LineMatch | undefined {
  const parsed = parseJsonObject(line);

  if (parsed && matchOn && matchOn.length > 0) {
    const allFieldsMatch = matchOn.every(({ field, value }) => String(parsed[field]) === value);
    if (!allFieldsMatch) {
      return undefined;
    }
    const traceId = parsed.trace_id;
    const matchedVia =
      typeof traceId === 'string' && traceId.length > 0 ? 'trace-id' : 'structured-field';
    return { matchedVia, record: parsed };
  }

  return line.includes(pattern) ? { matchedVia: 'substring', record: undefined } : undefined;
}

/**
 * Evaluates every line in `text` against `pattern`/`matchOn`, per
 * architecture.md §5's three-rung ladder. Returns `undefined` when nothing
 * matches yet — the caller (a {@link import('./poll.js').poll} condition)
 * should treat that as "not true yet" and retry.
 *
 * `expectedMatches` is only enforced when `matchOn` is declared — a bare
 * substring `pattern` was never meant to identify a single record, so it
 * has no duplicate to detect.
 *
 * @throws {DuplicateMatchError} If `matchOn` is declared and more than
 *   `expectedMatches` lines match.
 */
export function findMatches(
  text: string,
  pattern: string,
  matchOn: readonly MatchOnField[] | undefined,
  expectedMatches: number | 'any',
): MatchResult | undefined {
  const matches = text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => matchLine(line, pattern, matchOn))
    .filter((match): match is LineMatch => match !== undefined);

  if (matches.length === 0) {
    return undefined;
  }

  const hasMatchOn = matchOn !== undefined && matchOn.length > 0;
  if (hasMatchOn && expectedMatches !== 'any' && matches.length > expectedMatches) {
    throw new DuplicateMatchError(matches.length, expectedMatches);
  }

  const strongest = matches.reduce((strongest, current) =>
    MATCH_STRENGTH[current.matchedVia] > MATCH_STRENGTH[strongest.matchedVia] ? current : strongest,
  );

  const result: MatchResult = { matchedVia: strongest.matchedVia, matchCount: matches.length };
  if (strongest.record !== undefined) {
    result.record = strongest.record;
  }
  return result;
}
