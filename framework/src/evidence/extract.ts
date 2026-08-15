function describeRecord(record: Record<string, unknown> | undefined): string {
  return record === undefined
    ? 'undefined (no record — the match likely resolved via the substring rung, which has no parsed payload)'
    : JSON.stringify(record);
}

function extract<T>(
  record: Record<string, unknown> | undefined,
  field: string,
  isType: (value: unknown) => value is T,
  typeName: string,
): T {
  const value = record?.[field];
  if (!isType(value)) {
    throw new Error(`expected record.${field} to be a ${typeName}, got ${describeRecord(record)}`);
  }
  return value;
}

/**
 * Reads `field` off a matched log record (`WaitForResult.record`) as a
 * string, or throws a descriptive error if the record is absent (a
 * `substring` match never carries one) or the field isn't a string.
 */
export function extractString(record: Record<string, unknown> | undefined, field: string): string {
  return extract(record, field, (value): value is string => typeof value === 'string', 'string');
}

/** Same as {@link extractString}, for a `number` field. */
export function extractNumber(record: Record<string, unknown> | undefined, field: string): number {
  return extract(record, field, (value): value is number => typeof value === 'number', 'number');
}

/** Same as {@link extractString}, for a `boolean` field. */
export function extractBoolean(
  record: Record<string, unknown> | undefined,
  field: string,
): boolean {
  return extract(record, field, (value): value is boolean => typeof value === 'boolean', 'boolean');
}
