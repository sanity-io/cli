/**
 * Checks if the given value conforms to a minimum studio config shape.
 *
 * @param value - The value to check
 * @returns Whether the value is a studio config
 * @internal
 */
export function isStudioConfig(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.every((item) => isStudioConfig(item))
  }

  // Only actual properties marked as required by typescript are `projectId` and `dataset`,
  // so this is a pretty weak check - but better than nothing.
  if (typeof value === 'object' && value !== null) {
    return (
      'projectId' in value &&
      typeof value.projectId === 'string' &&
      'dataset' in value &&
      typeof value.dataset === 'string'
    )
  }

  return false
}
