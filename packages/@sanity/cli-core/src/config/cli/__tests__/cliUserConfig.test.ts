import path from 'node:path'

import {readHostCliUserConfig, writeHostCliUserConfig} from '@sanity/cli-setup/user-config'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {runWithCliExecutionContext} from '../../../executionContext.js'
import {getSanityConfigDir} from '../../../util/getSanityConfigDir.js'
import {clearCliTokenCache, getCachedTokenInfo, setCachedTokenInfo} from '../cliTokenCache.js'
import {
  _internals,
  getCliToken,
  getCliTokenInfo,
  getCliUserConfig,
  getUserConfig,
  setCliUserConfig,
} from '../cliUserConfig'

// Mock out cache so we can control it
vi.mock('../cliTokenCache.js')
vi.mock('@sanity/cli-setup/user-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-setup/user-config')>()),
  readHostCliUserConfig: vi.fn(),
  writeHostCliUserConfig: vi.fn(),
}))

const mockGetCliUserConfig = vi.spyOn(_internals, 'getCliUserConfig')

describe('cliUserConfig', () => {
  beforeEach(() => {
    vi.mocked(readHostCliUserConfig).mockReturnValue({})
    vi.mocked(writeHostCliUserConfig).mockReturnValue()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getCliToken()', () => {
    beforeEach(() => {
      mockGetCliUserConfig.mockReturnValue('mock-token')
      // clearAllMocks() does not reset implementations, so make the cache
      // state explicit for every test
      vi.mocked(getCachedTokenInfo).mockReturnValue(undefined)
    })
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    test('should return token from environment variable', async () => {
      vi.stubEnv('SANITY_AUTH_TOKEN', 'test-token')
      const token = await getCliToken()
      expect(token).toBe('test-token')
      expect(mockGetCliUserConfig).not.toHaveBeenCalled()
    })

    test('should return token from config if no environment variable is set', async () => {
      mockGetCliUserConfig.mockImplementation(() => {
        return 'config-token'
      })

      const token = await getCliToken()
      expect(token).toBe('config-token')
      expect(mockGetCliUserConfig).toHaveBeenCalledWith('authToken')
    })

    test('should return undefined if no token is available', async () => {
      mockGetCliUserConfig.mockReturnValueOnce(undefined)

      const token = await getCliToken()
      expect(token).toBeUndefined()
      expect(mockGetCliUserConfig).toHaveBeenCalledWith('authToken')
    })

    test('should return cached token if available', async () => {
      vi.mocked(getCachedTokenInfo).mockReturnValue({
        source: 'cached-source',
        token: 'cached-token',
      })
      const token = await getCliToken()
      expect(token).toEqual('cached-token')
    })

    test('should cache the token from environment variable', async () => {
      vi.mocked(getCachedTokenInfo).mockReturnValue(undefined)
      vi.stubEnv('SANITY_AUTH_TOKEN', 'cached-env-token')

      const token = await getCliToken()
      expect(token).toEqual('cached-env-token')
      expect(vi.mocked(setCachedTokenInfo)).toHaveBeenCalledWith({
        source: 'SANITY_AUTH_TOKEN environment variable',
        token: 'cached-env-token',
      })
      expect(mockGetCliUserConfig).not.toHaveBeenCalled()
    })

    test('should cache the token from config', async () => {
      vi.mocked(getCachedTokenInfo).mockReturnValue(undefined)
      mockGetCliUserConfig.mockReturnValueOnce('cached-config-token')

      const token = await getCliToken()
      expect(token).toEqual('cached-config-token')
      expect(vi.mocked(setCachedTokenInfo)).toHaveBeenCalledWith({
        source: expect.stringContaining('config.json'),
        token: 'cached-config-token',
      })
      expect(mockGetCliUserConfig).toHaveBeenCalledTimes(1)
    })

    test('should trim whitespace from environment token', async () => {
      vi.stubEnv('SANITY_AUTH_TOKEN', '  trimmed-token  ')
      const token = await getCliToken()
      expect(token).toBe('trimmed-token')
    })

    test('should prefer execution context token over env, config and cache', async () => {
      vi.mocked(getCachedTokenInfo).mockReturnValue({
        source: 'cached-source',
        token: 'cached-token',
      })
      vi.stubEnv('SANITY_AUTH_TOKEN', 'env-token')

      const token = await runWithCliExecutionContext({token: 'context-token'}, () => getCliToken())

      expect(token).toBe('context-token')
      // The context token must never touch the process-wide cache: reading it
      // could leak another invocation's token, writing it would leak this one's
      expect(vi.mocked(getCachedTokenInfo)).not.toHaveBeenCalled()
      expect(vi.mocked(setCachedTokenInfo)).not.toHaveBeenCalled()
      expect(mockGetCliUserConfig).not.toHaveBeenCalled()
    })

    test('execution context without token never falls back to host resolution', async () => {
      vi.mocked(getCachedTokenInfo).mockReturnValue({
        source: 'cached-source',
        token: 'cached-token',
      })
      vi.stubEnv('SANITY_AUTH_TOKEN', 'env-token')

      const token = await runWithCliExecutionContext({}, () => getCliToken())

      expect(token).toBeUndefined()
      expect(getCachedTokenInfo).not.toHaveBeenCalled()
      expect(mockGetCliUserConfig).not.toHaveBeenCalled()
    })

    test('should re-read after clearCliTokenCache', async () => {
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

    test('returns the execution context as the token source', async () => {
      const tokenInfo = await runWithCliExecutionContext({token: 'context-token'}, () =>
        getCliTokenInfo(),
      )

      expect(tokenInfo).toEqual({source: 'CLI execution context', token: 'context-token'})
    })

    test('returns the environment variable as the token source', async () => {
      vi.stubEnv('SANITY_AUTH_TOKEN', 'env-token')

      const tokenInfo = await getCliTokenInfo()

      expect(tokenInfo).toEqual({
        source: 'SANITY_AUTH_TOKEN environment variable',
        token: 'env-token',
      })
    })

    test('returns the custom config path as the token source', async () => {
      vi.stubEnv('SANITY_CLI_CONFIG_PATH', '/test/custom-config.json')
      mockGetCliUserConfig.mockReturnValue('config-token')

      const tokenInfo = await getCliTokenInfo()

      expect(tokenInfo).toEqual({source: '/test/custom-config.json', token: 'config-token'})
    })

    test('returns the default config path as the token source', async () => {
      mockGetCliUserConfig.mockReturnValue('config-token')

      const tokenInfo = await getCliTokenInfo()

      expect(tokenInfo).toEqual({
        source: path.join(getSanityConfigDir(), 'config.json'),
        token: 'config-token',
      })
    })

    test('returns the cached token and its original source', async () => {
      const cachedTokenInfo = {source: 'cached-source', token: 'cached-token'}
      vi.mocked(getCachedTokenInfo).mockReturnValue(cachedTokenInfo)

      const tokenInfo = await getCliTokenInfo()

      expect(tokenInfo).toBe(cachedTokenInfo)
    })
  })

  describe('getCliUserConfig()', () => {
    test('returns authToken when valid', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({
        authToken: 'test-token',
      })

      const result = getCliUserConfig('authToken')
      expect(result).toBe('test-token')
    })

    test('returns undefined when authToken is not set', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({})

      const result = getCliUserConfig('authToken')
      expect(result).toBeUndefined()
    })

    test('returns undefined for invalid value type', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({
        authToken: 123, // Invalid type, should be string
      })

      expect(getCliUserConfig('authToken')).toBeUndefined()
    })
  })

  describe('setCliUserConfig', () => {
    test('sets valid authToken', () => {
      setCliUserConfig('authToken', 'new-token')

      expect(writeHostCliUserConfig).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          authToken: 'new-token',
        }),
      )
    })

    test('throws error for invalid value type', () => {
      expect(() => setCliUserConfig('authToken', 123 as never)).toThrow('Invalid value')
    })

    test('merges new config with existing config', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({
        authToken: 'existing-token',
        someOtherKey: 'preserved',
      })

      setCliUserConfig('authToken', 'new-token')

      expect(writeHostCliUserConfig).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          authToken: 'new-token',
          someOtherKey: 'preserved',
        }),
      )
    })

    test('setting undefined explicitly removes the key', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({
        authToken: 'old-token',
        someOtherKey: 'preserved',
      })

      setCliUserConfig('authToken', undefined)

      expect(writeHostCliUserConfig).toHaveBeenCalledWith(expect.any(String), {
        someOtherKey: 'preserved',
      })
    })

    test('invalidates token cache after setting authToken', () => {
      setCliUserConfig('authToken', 'new-token')
      expect(clearCliTokenCache).toHaveBeenCalled()
    })

    test('invalidates token cache after clearing authToken', () => {
      setCliUserConfig('authToken', undefined)
      expect(clearCliTokenCache).toHaveBeenCalled()
    })
  })

  describe('getUserConfig', () => {
    test('is unavailable under an execution context', () => {
      expect(() => runWithCliExecutionContext({}, () => getUserConfig())).toThrow(
        'Host CLI user configuration is unavailable',
      )
      expect(readHostCliUserConfig).not.toHaveBeenCalled()
    })

    test('get returns raw value from file', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({
        myKey: 'myValue',
        nested: {deep: true},
      })

      const store = getUserConfig()
      const result = store.get('myKey')
      expect(result).toBe('myValue')
    })

    test('get returns undefined for missing key', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({})

      const store = getUserConfig()
      const result = store.get('nonexistent')
      expect(result).toBeUndefined()
    })

    test('set reads file, adds key, and writes file', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({
        existing: 'value',
      })

      const store = getUserConfig()
      store.set('newKey', 'newValue')

      expect(writeHostCliUserConfig).toHaveBeenCalledWith(expect.any(String), {
        existing: 'value',
        newKey: 'newValue',
      })
    })

    test('set overwrites existing key', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({
        myKey: 'oldValue',
      })

      const store = getUserConfig()
      store.set('myKey', 'updatedValue')

      expect(writeHostCliUserConfig).toHaveBeenCalledWith(expect.any(String), {
        myKey: 'updatedValue',
      })
    })

    test('set invalidates token cache when key is authToken', () => {
      const store = getUserConfig()
      store.set('authToken', 'new-token')
      expect(clearCliTokenCache).toHaveBeenCalled()
    })

    test('set does not invalidate token cache for other keys', () => {
      const store = getUserConfig()
      store.set('telemetryConsent', 'granted')
      expect(clearCliTokenCache).not.toHaveBeenCalled()
    })

    test('set handles complex values', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({})

      const store = getUserConfig()
      const complexValue = {status: 'granted', updatedAt: 12_345}
      store.set('telemetryConsent', complexValue)

      expect(writeHostCliUserConfig).toHaveBeenCalledWith(expect.any(String), {
        telemetryConsent: complexValue,
      })
    })

    test('delete removes key from file and writes', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({
        keepMe: 'yes',
        removeMe: 'bye',
      })

      const store = getUserConfig()
      store.delete('removeMe')

      expect(writeHostCliUserConfig).toHaveBeenCalledWith(
        expect.any(String),
        {keepMe: 'yes'},
        {createDirectory: false},
      )
    })

    test('delete invalidates token cache when key is authToken', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({authToken: 'old-token'})
      const store = getUserConfig()
      store.delete('authToken')
      expect(clearCliTokenCache).toHaveBeenCalled()
    })

    test('delete does not invalidate token cache for other keys', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({telemetryConsent: 'granted'})
      const store = getUserConfig()
      store.delete('telemetryConsent')
      expect(clearCliTokenCache).not.toHaveBeenCalled()
    })

    test('delete is a no-op when key does not exist', () => {
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({
        existing: 'value',
      })

      const store = getUserConfig()
      store.delete('nonexistent')

      expect(writeHostCliUserConfig).not.toHaveBeenCalled()
    })

    test('each operation does a fresh read', () => {
      const store = getUserConfig()

      // First call returns one state
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({counter: 1})
      expect(store.get('counter')).toBe(1)

      // Second call returns updated state
      vi.mocked(readHostCliUserConfig).mockReturnValueOnce({counter: 2})
      expect(store.get('counter')).toBe(2)

      expect(readHostCliUserConfig).toHaveBeenCalledTimes(2)
    })
  })
})
