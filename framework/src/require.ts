/**
 * Returns `value` narrowed to `T`, or throws with `message` if it's
 * `undefined`. For state a Flow computed itself and needs later — a
 * seeded reference-data lookup, an array index — not a replacement for
 * `expect`'s assertion vocabulary (`.claude/rules/evidence-layer.md`):
 * this narrows for TypeScript control flow, it doesn't compare a value
 * against an expectation.
 */
export function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

/**
 * `array.find(predicate)`, requiring a match — throws instead of
 * returning `undefined`. `message` defaults to naming the array's length
 * when omitted.
 */
export function findItem<T>(
  array: readonly T[],
  predicate: (item: T) => boolean,
  message?: string,
): T {
  return requireDefined(
    array.find(predicate),
    message ?? `expected to find a matching item in an array of ${array.length.toString()}`,
  );
}
