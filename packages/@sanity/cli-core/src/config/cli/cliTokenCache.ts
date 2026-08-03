/**
 * Module-level cache for the CLI auth token, shared between
 * `getCliToken` (reads/writes) and `setCliUserConfig` (invalidates).
 *
 * Extracted into its own module to avoid a circular dependency
 * between `cliUserConfig.ts` and `getCliToken.ts`.
 */
let cachedToken: string | undefined

export function getCachedToken(): string | undefined {
  return cachedToken
}

export function setCachedToken(token: string | undefined): void {
  cachedToken = token
}

/**
 * Clear the in-process token cache so the next `getCliToken()` call
 * re-reads from disk or the environment.
 *
 * Called automatically by `setCliUserConfig('authToken', ...)`.
 *
 * @internal
 */
export function clearCliTokenCache(): void {
  cachedToken = undefined
}
