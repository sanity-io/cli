import {mkdir} from 'node:fs/promises'
import {homedir} from 'node:os'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getConfig, setConfig} from '../../services/cliUserConfig'
import {readJsonFile} from '../../util/readJsonFile'
import {writeJsonFile} from '../../util/writeJsonFile'

vi.mock('node:fs/promises')
vi.mock('node:os')
vi.mock('../../util/readJsonFile')
vi.mock('../../util/writeJsonFile')

const mockHomedir = '/mock/home/dir'

describe('cliUserConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(homedir).mockReturnValue(mockHomedir)
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(readJsonFile).mockResolvedValue({})
    vi.mocked(writeJsonFile).mockResolvedValue()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('readConfig behavior', () => {
    test('returns empty config when file read fails', async () => {
      vi.mocked(readJsonFile).mockRejectedValueOnce(new Error('File not found'))
      const result = await getConfig('authToken')
      expect(result).toBeUndefined()
    })

    test('returns empty config when file content is null', async () => {
      vi.mocked(readJsonFile).mockResolvedValueOnce(null)
      const result = await getConfig('authToken')
      expect(result).toBeUndefined()
    })

    test('returns empty config when file content is an array', async () => {
      vi.mocked(readJsonFile).mockResolvedValueOnce([])
      const result = await getConfig('authToken')
      expect(result).toBeUndefined()
    })

    test('returns empty config when file content is not an object', async () => {
      vi.mocked(readJsonFile).mockResolvedValueOnce('not an object')
      const result = await getConfig('authToken')
      expect(result).toBeUndefined()
    })
  })

  describe('getConfig', () => {
    test('returns authToken when valid', async () => {
      vi.mocked(readJsonFile).mockResolvedValueOnce({
        authToken: 'test-token',
      })

      const result = await getConfig('authToken')
      expect(result).toBe('test-token')
    })

    test('returns undefined when authToken is not set', async () => {
      vi.mocked(readJsonFile).mockResolvedValueOnce({})

      const result = await getConfig('authToken')
      expect(result).toBeUndefined()
    })

    test('returns telemetryConsent when valid', async () => {
      const mockConsent = {
        updatedAt: Date.now(),
        value: {
          status: 'granted',
          type: 'explicit',
        },
      }
      vi.mocked(readJsonFile).mockResolvedValueOnce({
        telemetryConsent: mockConsent,
      })

      const result = await getConfig('telemetryConsent')
      expect(result).toEqual(mockConsent)
    })

    test('throws error for invalid property', async () => {
      await expect(getConfig('invalidProp' as never)).rejects.toThrow('No schema defined')
    })

    test('throws error for invalid value type', async () => {
      vi.mocked(readJsonFile).mockResolvedValueOnce({
        authToken: 123, // Invalid type, should be string
      })

      await expect(getConfig('authToken')).rejects.toThrow('Invalid value')
    })
  })

  describe('setConfig', () => {
    test('sets valid authToken', async () => {
      await setConfig('authToken', 'new-token')

      expect(mkdir).toHaveBeenCalledWith(expect.any(String), {recursive: true})
      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          authToken: 'new-token',
        }),
        expect.any(Object),
      )
    })

    test('sets valid telemetryConsent', async () => {
      const mockConsent = {
        updatedAt: Date.now(),
        value: {
          status: 'granted' as const,
          type: 'explicit',
        },
      }

      await setConfig('telemetryConsent', mockConsent)

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          telemetryConsent: mockConsent,
        }),
        expect.any(Object),
      )
    })

    test('throws error for invalid property', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(setConfig('invalidProp' as any, 'value')).rejects.toThrow('No schema defined')
    })

    test('throws error for invalid value type', async () => {
      await expect(setConfig('authToken', 123 as never)).rejects.toThrow('Invalid value')
    })

    test('merges new config with existing config', async () => {
      vi.mocked(readJsonFile).mockResolvedValueOnce({
        authToken: 'existing-token',
      })

      await setConfig('telemetryConsent', {
        updatedAt: 123,
        value: {
          status: 'granted' as const,
          type: 'explicit',
        },
      })

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          authToken: 'existing-token',
          telemetryConsent: expect.any(Object),
        }),
        expect.any(Object),
      )
    })
  })
})
