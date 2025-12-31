import {vi} from 'vitest'

export function createTestToken(token: string) {
  vi.stubEnv('SANITY_AUTH_TOKEN', token)
}
