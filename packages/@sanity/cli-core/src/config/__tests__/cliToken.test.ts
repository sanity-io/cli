import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getCliUserConfig} from '../../services/cliUserConfig'

vi.mock('../../services/cliUserConfig', () => ({
  getCliUserConfig: vi.fn(),
}))

describe('getCliToken', () => {
  let getCliToken: () => Promise<string | undefined>

  beforeEach(async () => {
    delete process.env.SANITY_AUTH_TOKEN
    vi.clearAllMocks()
    vi.resetModules()
    const module = await import('../../services/getCliToken.js')
    getCliToken = module.getCliToken
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should return token from environment variable', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', 'test-token')
    const token = await getCliToken()
    expect(token).toBe('test-token')
    expect(getCliUserConfig).not.toHaveBeenCalled()
  })

  it('should return token from config if no environment variable is set', async () => {
    vi.mocked(getCliUserConfig).mockReturnValueOnce('config-token')

    const token = await getCliToken()
    expect(token).toBe('config-token')
    expect(getCliUserConfig).toHaveBeenCalledWith('authToken')
  })

  it('should return undefined if no token is available', async () => {
    vi.mocked(getCliUserConfig).mockReturnValueOnce(undefined)

    const token = await getCliToken()
    expect(token).toBeUndefined()
    expect(getCliUserConfig).toHaveBeenCalledWith('authToken')
  })

  it('should cache the token from environment variable', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', 'cached-env-token')

    const firstCall = await getCliToken()
    vi.stubEnv('SANITY_AUTH_TOKEN', 'new-token')
    const secondCall = await getCliToken()

    expect(firstCall).toBe('cached-env-token')
    expect(secondCall).toBe('cached-env-token')
    expect(getCliUserConfig).not.toHaveBeenCalled()
  })

  it('should cache the token from config', async () => {
    vi.mocked(getCliUserConfig).mockReturnValueOnce('cached-config-token')

    const firstCall = await getCliToken()
    const secondCall = await getCliToken()

    expect(firstCall).toBe('cached-config-token')
    expect(secondCall).toBe('cached-config-token')
    expect(getCliUserConfig).toHaveBeenCalledTimes(1)
  })

  it('should trim whitespace from environment token', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', '  trimmed-token  ')
    const token = await getCliToken()
    expect(token).toBe('trimmed-token')
  })

  it('should re-read after clearCliTokenCache', async () => {
    vi.mocked(getCliUserConfig).mockReturnValueOnce('first-token')
    const module = await import('../../services/getCliToken')

    const firstCall = await module.getCliToken()
    expect(firstCall).toBe('first-token')

    // Clear cache and set up a new return value
    module.clearCliTokenCache()
    vi.mocked(getCliUserConfig).mockReturnValueOnce('second-token')

    const secondCall = await module.getCliToken()
    expect(secondCall).toBe('second-token')
    expect(getCliUserConfig).toHaveBeenCalledTimes(2)
  })
})
