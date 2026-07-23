import {mkdirSync} from 'node:fs'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {runWithCliExecutionContext} from '../../../executionContext.js'
import {readJsonFileSync} from '../../../util/readJsonFileSync'
import {writeJsonFileSync} from '../../../util/writeJsonFileSync.js'
import {clearCliTokenCache, getCachedToken, setCachedToken} from '../cliTokenCache.js'
import {
  _internals,
  getCliToken,
  getCliUserConfig,
  getUserConfig,
  setCliUserConfig,
} from '../cliUserConfig'

// Mock out cache so we can control it
vi.mock('../cliTokenCache.js')
vi.mock('../../../util/readJsonFileSync.js')
vi.mock('../../../util/writeJsonFileSync.js')
vi.mock('node:fs')

const mockGetCliUserConfig = vi.spyOn(_internals, 'getCliUserConfig')

describe('cliUserConfig', () => {
  beforeEach(() => {
    vi.mocked(readJsonFileSync).mockReturnValue({})
    vi.mocked(writeJsonFileSync).mockReturnValue()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getCliToken()', () => {
    beforeEach(() => {
      mockGetCliUserConfig.mockReturnValue('mock-token')
      // clearAllMocks() does not reset implementations, so make the cache
      // state explicit for every test
      vi.mocked(getCachedToken).mockReturnValue(undefined)
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
      vi.mocked(getCachedToken).mockReturnValue('cached-token')
      const token = await getCliToken()
      expect(token).toEqual('cached-token')
    })

    test('should cache the token from environment variable', async () => {
      vi.mocked(getCachedToken).mockReturnValue(undefined)
      vi.stubEnv('SANITY_AUTH_TOKEN', 'cached-env-token')

      const token = await getCliToken()
      expect(token).toEqual('cached-env-token')
      expect(vi.mocked(setCachedToken)).toHaveBeenCalledWith('cached-env-token')
      expect(mockGetCliUserConfig).not.toHaveBeenCalled()
    })

    test('should cache the token from config', async () => {
      vi.mocked(getCachedToken).mockReturnValue(undefined)
      mockGetCliUserConfig.mockReturnValueOnce('cached-config-token')

      const token = await getCliToken()
      expect(token).toEqual('cached-config-token')
      expect(vi.mocked(setCachedToken)).toHaveBeenCalledWith('cached-config-token')
      expect(mockGetCliUserConfig).toHaveBeenCalledTimes(1)
    })

    test('should trim whitespace from environment token', async () => {
      vi.stubEnv('SANITY_AUTH_TOKEN', '  trimmed-token  ')
      const token = await getCliToken()
      expect(token).toBe('trimmed-token')
    })

    test('should prefer execution context token over env, config and cache', async () => {
      vi.mocked(getCachedToken).mockReturnValue('cached-token')
      vi.stubEnv('SANITY_AUTH_TOKEN', 'env-token')

      const token = await runWithCliExecutionContext({token: 'context-token'}, () => getCliToken())

      expect(token).toBe('context-token')
      // The context token must never touch the process-wide cache: reading it
      // could leak another invocation's token, writing it would leak this one's
      expect(vi.mocked(getCachedToken)).not.toHaveBeenCalled()
      expect(vi.mocked(setCachedToken)).not.toHaveBeenCalled()
      expect(mockGetCliUserConfig).not.toHaveBeenCalled()
    })

    test('execution context without token falls back to normal resolution', async () => {
      vi.stubEnv('SANITY_AUTH_TOKEN', 'env-token')

      const token = await runWithCliExecutionContext({}, () => getCliToken())

      expect(token).toBe('env-token')
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
  })

  describe('getCliUserConfig()', () => {
    test('returns empty config when file read throws', () => {
      vi.mocked(readJsonFileSync).mockImplementationOnce(() => {
        throw new Error('File not found')
      })
      const result = getCliUserConfig('authToken')
      expect(result).toBeUndefined()
    })

    test('returns empty config when file content is null', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce(null)
      const result = getCliUserConfig('authToken')
      expect(result).toBeUndefined()
    })

    test('returns empty config when file content is an array', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce([])
      const result = getCliUserConfig('authToken')
      expect(result).toBeUndefined()
    })

    test('returns empty config when file content is not an object', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce('not an object')
      const result = getCliUserConfig('authToken')
      expect(result).toBeUndefined()
    })
    test('returns authToken when valid', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({
        authToken: 'test-token',
      })

      const result = getCliUserConfig('authToken')
      expect(result).toBe('test-token')
    })

    test('returns undefined when authToken is not set', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({})

      const result = getCliUserConfig('authToken')
      expect(result).toBeUndefined()
    })

    test('returns undefined for invalid value type', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({
        authToken: 123, // Invalid type, should be string
      })

      expect(getCliUserConfig('authToken')).toBeUndefined()
    })
  })

  describe('setCliUserConfig', () => {
    test('sets valid authToken', () => {
      setCliUserConfig('authToken', 'new-token')

      expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), {recursive: true})
      expect(writeJsonFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          authToken: 'new-token',
        }),
        expect.any(Object),
      )
    })

    test('throws error for invalid value type', () => {
      expect(() => setCliUserConfig('authToken', 123 as never)).toThrow('Invalid value')
    })

    test('merges new config with existing config', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({
        authToken: 'existing-token',
        someOtherKey: 'preserved',
      })

      setCliUserConfig('authToken', 'new-token')

      expect(writeJsonFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          authToken: 'new-token',
          someOtherKey: 'preserved',
        }),
        expect.any(Object),
      )
    })

    test('setting undefined explicitly removes the key', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({
        authToken: 'old-token',
        someOtherKey: 'preserved',
      })

      setCliUserConfig('authToken', undefined)

      expect(writeJsonFileSync).toHaveBeenCalledWith(
        expect.any(String),
        {someOtherKey: 'preserved'},
        expect.any(Object),
      )
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
    test('get returns raw value from file', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({
        myKey: 'myValue',
        nested: {deep: true},
      })

      const store = getUserConfig()
      const result = store.get('myKey')
      expect(result).toBe('myValue')
    })

    test('get returns undefined for missing key', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({})

      const store = getUserConfig()
      const result = store.get('nonexistent')
      expect(result).toBeUndefined()
    })

    test('get returns undefined when file read fails', () => {
      vi.mocked(readJsonFileSync).mockImplementationOnce(() => {
        throw new Error('File not found')
      })

      const store = getUserConfig()
      const result = store.get('anyKey')
      expect(result).toBeUndefined()
    })

    test('set reads file, adds key, and writes file', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({
        existing: 'value',
      })

      const store = getUserConfig()
      store.set('newKey', 'newValue')

      expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), {recursive: true})
      expect(writeJsonFileSync).toHaveBeenCalledWith(
        expect.any(String),
        {existing: 'value', newKey: 'newValue'},
        {pretty: true},
      )
    })

    test('set overwrites existing key', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({
        myKey: 'oldValue',
      })

      const store = getUserConfig()
      store.set('myKey', 'updatedValue')

      expect(writeJsonFileSync).toHaveBeenCalledWith(
        expect.any(String),
        {myKey: 'updatedValue'},
        {pretty: true},
      )
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
      vi.mocked(readJsonFileSync).mockReturnValueOnce({})

      const store = getUserConfig()
      const complexValue = {status: 'granted', updatedAt: 12_345}
      store.set('telemetryConsent', complexValue)

      expect(writeJsonFileSync).toHaveBeenCalledWith(
        expect.any(String),
        {telemetryConsent: complexValue},
        {pretty: true},
      )
    })

    test('delete removes key from file and writes', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({
        keepMe: 'yes',
        removeMe: 'bye',
      })

      const store = getUserConfig()
      store.delete('removeMe')

      expect(mkdirSync).not.toHaveBeenCalled()
      expect(writeJsonFileSync).toHaveBeenCalledWith(
        expect.any(String),
        {keepMe: 'yes'},
        {pretty: true},
      )
    })

    test('delete invalidates token cache when key is authToken', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({authToken: 'old-token'})
      const store = getUserConfig()
      store.delete('authToken')
      expect(clearCliTokenCache).toHaveBeenCalled()
    })

    test('delete does not invalidate token cache for other keys', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({telemetryConsent: 'granted'})
      const store = getUserConfig()
      store.delete('telemetryConsent')
      expect(clearCliTokenCache).not.toHaveBeenCalled()
    })

    test('delete is a no-op when key does not exist', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({
        existing: 'value',
      })

      const store = getUserConfig()
      store.delete('nonexistent')

      expect(writeJsonFileSync).not.toHaveBeenCalled()
    })

    test('each operation does a fresh read', () => {
      const store = getUserConfig()

      // First call returns one state
      vi.mocked(readJsonFileSync).mockReturnValueOnce({counter: 1})
      expect(store.get('counter')).toBe(1)

      // Second call returns updated state
      vi.mocked(readJsonFileSync).mockReturnValueOnce({counter: 2})
      expect(store.get('counter')).toBe(2)

      expect(readJsonFileSync).toHaveBeenCalledTimes(2)
    })
  })
})
