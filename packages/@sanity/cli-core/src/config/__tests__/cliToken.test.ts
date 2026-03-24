import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getCliUserConfig} from '../../services/cliUserConfig'

vi.mock('../../services/cliUserConfig', () => ({
  getCliUserConfig: vi.fn(),
}))

describe('getCliToken', () => {
  const originalEnv = process.env
  let getCliToken: () => Promise<string | undefined>

  beforeEach(async () => {
    process.env = {...originalEnv}
    vi.clearAllMocks()
    vi.resetModules()
    const module = await import('../../services/getCliToken.js')
    getCliToken = module.getCliToken
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('should return token from environment variable', async () => {
    process.env.SANITY_AUTH_TOKEN = 'test-token'
    const token = await getCliToken()
    expect(token).toBe('test-token')
    expect(getCliUserConfig).not.toHaveBeenCalled()
  })

  it('should return token from config if no environment variable is set', async () => {
    delete process.env.SANITY_AUTH_TOKEN
    vi.mocked(getCliUserConfig).mockResolvedValueOnce('config-token')

    const token = await getCliToken()
    expect(token).toBe('config-token')
    expect(getCliUserConfig).toHaveBeenCalledWith('authToken')
  })

  it('should return undefined if no token is available', async () => {
    delete process.env.SANITY_AUTH_TOKEN
    vi.mocked(getCliUserConfig).mockResolvedValueOnce(undefined)

    const token = await getCliToken()
    expect(token).toBeUndefined()
    expect(getCliUserConfig).toHaveBeenCalledWith('authToken')
  })

  it('should cache the token from environment variable', async () => {
    process.env.SANITY_AUTH_TOKEN = 'cached-env-token'

    const firstCall = await getCliToken()
    process.env.SANITY_AUTH_TOKEN = 'new-token'
    const secondCall = await getCliToken()

    expect(firstCall).toBe('cached-env-token')
    expect(secondCall).toBe('cached-env-token')
    expect(getCliUserConfig).not.toHaveBeenCalled()
  })

  it('should cache the token from config', async () => {
    delete process.env.SANITY_AUTH_TOKEN
    vi.mocked(getCliUserConfig).mockResolvedValueOnce('cached-config-token')

    const firstCall = await getCliToken()
    const secondCall = await getCliToken()

    expect(firstCall).toBe('cached-config-token')
    expect(secondCall).toBe('cached-config-token')
    expect(getCliUserConfig).toHaveBeenCalledTimes(1)
  })
})
