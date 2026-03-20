import {mkdirSync} from 'node:fs'
import {homedir} from 'node:os'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getCliUserConfig, getUserConfig, setCliUserConfig} from '../../services/cliUserConfig'
import {readJsonFileSync} from '../../util/readJsonFileSync'
import {writeJsonFileSync} from '../../util/writeJsonFileSync'

vi.mock('node:fs')
vi.mock('node:os')
vi.mock('../../util/readJsonFileSync')
vi.mock('../../util/writeJsonFileSync')

const mockHomedir = '/mock/home/dir'

describe('cliUserConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(homedir).mockReturnValue(mockHomedir)
    vi.mocked(mkdirSync).mockReturnValue(undefined)
    vi.mocked(readJsonFileSync).mockReturnValue({})
    vi.mocked(writeJsonFileSync).mockReturnValue()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('readConfig behavior', () => {
    test('returns empty config when file read fails', () => {
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
  })

  describe('getCliUserConfig', () => {
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

      expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), {recursive: true})
      expect(writeJsonFileSync).toHaveBeenCalledWith(
        expect.any(String),
        {keepMe: 'yes'},
        {pretty: true},
      )
    })

    test('delete is a no-op write when key does not exist', () => {
      vi.mocked(readJsonFileSync).mockReturnValueOnce({
        existing: 'value',
      })

      const store = getUserConfig()
      store.delete('nonexistent')

      expect(writeJsonFileSync).toHaveBeenCalledWith(
        expect.any(String),
        {existing: 'value'},
        {pretty: true},
      )
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
