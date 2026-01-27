/**
 * Checks if the environment is staging.
 *
 * @returns True if the environment is staging, false otherwise
 * @internal
 */
export function isStaging(): boolean {
  return process.env.SANITY_INTERNAL_ENV === 'staging'
}
