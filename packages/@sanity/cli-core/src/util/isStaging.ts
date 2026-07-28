import {getCliExecutionContext} from '../executionContext.js'

/**
 * Checks if the environment is staging.
 *
 * @returns True if the environment is staging, false otherwise
 * @internal
 */
export function isStaging(): boolean {
  return (getCliExecutionContext()?.sanityEnv ?? process.env.SANITY_INTERNAL_ENV) === 'staging'
}
