import {vi} from 'vitest'

/**
 * Creates a test token for the Sanity CLI
 *
 * @public
 *
 * @param token - The token to create
 * @returns void
 */
export function createTestToken(token: string) {
  vi.stubEnv('SANITY_AUTH_TOKEN', token)
}
