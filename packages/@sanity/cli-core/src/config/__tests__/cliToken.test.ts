import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getConfig} from '../../services/cliUserConfig'
import * as cliTokenModule from '../../services/getCliToken'

vi.mock('../../services/cliUserConfig', () => ({
  getConfig: vi.fn(),
}))

describe('getCliToken', () => {
  const originalEnv = process.env
  let cachedToken: string | undefined

  beforeEach(() => {
    process.env = {...originalEnv}
    vi.clearAllMocks()
    vi.resetModules()
    cachedToken = undefined
    vi.spyOn(cliTokenModule, 'getCliToken').mockImplementation(async () => {
      if (cachedToken !== undefined) {
        return cachedToken
      }

      const token = process.env.SANITY_AUTH_TOKEN
      if (token) {
        cachedToken = token.trim()
        return cachedToken
      }

      cachedToken = await getConfig('authToken')
      return cachedToken
    })
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('should return token from environment variable', async () => {
    process.env.SANITY_AUTH_TOKEN = 'test-token'
    const token = await cliTokenModule.getCliToken()
    expect(token).toBe('test-token')
    expect(getConfig).not.toHaveBeenCalled()
  })

  it('should return token from config if no environment variable is set', async () => {
    delete process.env.SANITY_AUTH_TOKEN
    vi.mocked(getConfig).mockResolvedValueOnce('config-token')

    const token = await cliTokenModule.getCliToken()
    expect(token).toBe('config-token')
    expect(getConfig).toHaveBeenCalledWith('authToken')
  })

  it('should return undefined if no token is available', async () => {
    delete process.env.SANITY_AUTH_TOKEN
    vi.mocked(getConfig).mockResolvedValueOnce(undefined)

    const token = await cliTokenModule.getCliToken()
    expect(token).toBeUndefined()
    expect(getConfig).toHaveBeenCalledWith('authToken')
  })

  it('should cache the token from environment variable', async () => {
    process.env.SANITY_AUTH_TOKEN = 'cached-env-token'

    const firstCall = await cliTokenModule.getCliToken()
    process.env.SANITY_AUTH_TOKEN = 'new-token'
    const secondCall = await cliTokenModule.getCliToken()

    expect(firstCall).toBe('cached-env-token')
    expect(secondCall).toBe('cached-env-token')
    expect(getConfig).not.toHaveBeenCalled()
  })

  it('should cache the token from config', async () => {
    delete process.env.SANITY_AUTH_TOKEN
    vi.mocked(getConfig).mockResolvedValueOnce('cached-config-token')

    const firstCall = await cliTokenModule.getCliToken()
    const secondCall = await cliTokenModule.getCliToken()

    expect(firstCall).toBe('cached-config-token')
    expect(secondCall).toBe('cached-config-token')
    expect(getConfig).toHaveBeenCalledTimes(1)
  })
})
