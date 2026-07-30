import {getCliExecutionContext} from '../executionContext.js'

/**
 * Checks if the environment is staging.
 *
 * @returns True if the environment is staging, false otherwise
 * @internal
 */
export function isStaging(): boolean {
  const context = getCliExecutionContext()

  if (context) return context.sanityEnv === 'staging'

  return process.env.SANITY_INTERNAL_ENV === 'staging'
}
