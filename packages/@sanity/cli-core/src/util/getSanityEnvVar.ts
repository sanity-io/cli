/**
 * Gets an environment variable with the appropriate Sanity prefix based on whether it's an app or studio.
 *
 * @param suffix - The suffix for the environment variable (e.g., 'SERVER_HOSTNAME')
 * @param isApp - Whether to use the app prefix (SANITY_APP_) or studio prefix (SANITY_STUDIO_)
 * @returns The value of the environment variable, or undefined if not set
 *
 * @example
 * ```ts
 * // For studio: SANITY_STUDIO_SERVER_HOSTNAME
 * const studioHostname = getSanityEnvVar('SERVER_HOSTNAME', false)
 *
 * // For app: SANITY_APP_SERVER_HOSTNAME
 * const appHostname = getSanityEnvVar('SERVER_HOSTNAME', true)
 * ```
 *
 * @internal
 */
export function getSanityEnvVar(suffix: string, isApp: boolean): string | undefined {
  const prefix = isApp ? 'SANITY_APP_' : 'SANITY_STUDIO_'
  const envVarName = `${prefix}${suffix}`
  return process.env[envVarName]
}
