import {getCachedToken, setCachedToken} from './cliTokenCache.js'
import {getCliUserConfig} from './cliUserConfig.js'

// Re-export so existing consumers don't break
export {clearCliTokenCache} from './cliTokenCache.js'

/**
 * Get the CLI authentication token from the environment or the config file
 *
 * @returns A promise that resolves to a CLI token, or undefined if no token is found
 * @internal
 */
export async function getCliToken(): Promise<string | undefined> {
  const cached = getCachedToken()
  if (cached !== undefined) {
    return cached
  }

  const token = process.env.SANITY_AUTH_TOKEN
  if (token) {
    const trimmed = token.trim()
    setCachedToken(trimmed)
    return trimmed
  }

  const configToken = getCliUserConfig('authToken')
  setCachedToken(configToken)
  return configToken
}
