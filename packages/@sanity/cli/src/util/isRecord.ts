/**
 * Checks if the given value is a record (javascript objectish)
 *
 * @param value - Value to check
 * @returns True if the value is a record, false otherwise
 * @internal
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
