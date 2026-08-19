/**
 * Module-level cache for the resolved CLI auth token, shared between
 * `getCliTokenInfo` (reads/writes) and `setCliUserConfig` (invalidates).
 *
 * Extracted into its own module to avoid a circular dependency
 * between `cliUserConfig.ts` and `getCliToken.ts`.
 */
export interface CliTokenInfo {
  source: string
  token: string
}

let cachedTokenInfo: CliTokenInfo | undefined

export function getCachedTokenInfo(): CliTokenInfo | undefined {
  return cachedTokenInfo
}

export function setCachedTokenInfo(tokenInfo: CliTokenInfo | undefined): void {
  cachedTokenInfo = tokenInfo
}

/**
 * Clear the in-process token cache so the next token resolution
 * re-reads from disk or the environment.
 *
 * Called automatically by `setCliUserConfig('authToken', ...)`.
 *
 * @internal
 */
export function clearCliTokenCache(): void {
  cachedTokenInfo = undefined
}
