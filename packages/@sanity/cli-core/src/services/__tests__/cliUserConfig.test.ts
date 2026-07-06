import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {clearCliTokenCache, getCachedToken, setCachedToken} from '../cliTokenCache.js'
import {_internals, getCliToken} from '../cliUserConfig'

// Mock out cache so we can control it
vi.mock('../cliTokenCache.js')

const mockGetCliUserConfig = vi.spyOn(_internals, 'getCliUserConfig')

describe('getCliToken', () => {
  beforeEach(() => {
    mockGetCliUserConfig.mockReturnValue('mock-token')
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('should return token from environment variable', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', 'test-token')
    const token = await getCliToken()
    expect(token).toBe('test-token')
    expect(mockGetCliUserConfig).not.toHaveBeenCalled()
  })

  it('should return token from config if no environment variable is set', async () => {
    mockGetCliUserConfig.mockImplementation(() => {
      return 'config-token'
    })

    const token = await getCliToken()
    expect(token).toBe('config-token')
    expect(mockGetCliUserConfig).toHaveBeenCalledWith('authToken')
  })

  it('should return undefined if no token is available', async () => {
    mockGetCliUserConfig.mockReturnValueOnce(undefined)

    const token = await getCliToken()
    expect(token).toBeUndefined()
    expect(mockGetCliUserConfig).toHaveBeenCalledWith('authToken')
  })

  it('should return cached token if available', async () => {
    vi.mocked(getCachedToken).mockReturnValue('cached-token')
    const token = await getCliToken()
    expect(token).toEqual('cached-token')
  })

  it('should cache the token from environment variable', async () => {
    vi.mocked(getCachedToken).mockReturnValue(undefined)
    vi.stubEnv('SANITY_AUTH_TOKEN', 'cached-env-token')

    const token = await getCliToken()
    expect(token).toEqual('cached-env-token')
    expect(vi.mocked(setCachedToken)).toHaveBeenCalledWith('cached-env-token')
    expect(mockGetCliUserConfig).not.toHaveBeenCalled()
  })

  it('should cache the token from config', async () => {
    vi.mocked(getCachedToken).mockReturnValue(undefined)
    mockGetCliUserConfig.mockReturnValueOnce('cached-config-token')

    const token = await getCliToken()
    expect(token).toEqual('cached-config-token')
    expect(vi.mocked(setCachedToken)).toHaveBeenCalledWith('cached-config-token')
    expect(mockGetCliUserConfig).toHaveBeenCalledTimes(1)
  })

  it('should trim whitespace from environment token', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', '  trimmed-token  ')
    const token = await getCliToken()
    expect(token).toBe('trimmed-token')
  })

  it('should re-read after clearCliTokenCache', async () => {
    mockGetCliUserConfig.mockReturnValueOnce('first-token')

    const firstCall = await getCliToken()
    expect(firstCall).toBe('first-token')

    // Clear cache and set up a new return value
    clearCliTokenCache()
    mockGetCliUserConfig.mockReturnValueOnce('second-token')

    const secondCall = await getCliToken()
    expect(secondCall).toBe('second-token')
    expect(mockGetCliUserConfig).toHaveBeenCalledTimes(2)
  })
})
