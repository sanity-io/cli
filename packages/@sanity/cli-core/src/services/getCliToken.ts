import {getCliUserConfig} from './cliUserConfig.js'

let cachedToken: string | undefined

/**
 * Get the CLI authentication token from the environment or the config file
 *
 * @returns A promise that resolves to a CLI token, or undefined if no token is found
 * @internal
 */
export async function getCliToken(): Promise<string | undefined> {
  if (cachedToken !== undefined) {
    return cachedToken
  }

  const token = process.env.SANITY_AUTH_TOKEN
  if (token) {
    cachedToken = token.trim()
    return cachedToken
  }

  cachedToken = getCliUserConfig('authToken')
  return cachedToken
}
