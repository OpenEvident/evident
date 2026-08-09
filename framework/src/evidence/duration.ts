const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/;

type DurationUnit = 'ms' | 's' | 'm' | 'h';

const UNIT_TO_MS: Record<DurationUnit, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};

/**
 * Parses a duration string (e.g. `'500ms'`, `'2s'`, `'5m'`, `'1h'`) into milliseconds.
 *
 * @throws {Error} If `duration` doesn't match `<number><unit>`.
 */
export function parseDuration(duration: string): number {
  const match = DURATION_PATTERN.exec(duration);
  if (!match) {
    throw new Error(
      `Invalid duration "${duration}" — expected a number followed by ms, s, m, or h (e.g. "500ms", "2s", "5m").`,
    );
  }
  const [, value, unit] = match;
  return Number(value) * UNIT_TO_MS[unit as DurationUnit];
}
