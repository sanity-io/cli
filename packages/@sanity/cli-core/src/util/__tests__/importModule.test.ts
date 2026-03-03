import {fileURLToPath, pathToFileURL} from 'node:url'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {importModule} from '../importModule.js'

const mockJitiImport = vi.hoisted(() => vi.fn())
const mockCreateJiti = vi.hoisted(() => vi.fn().mockReturnValue({import: mockJitiImport}))

vi.mock('@rexxars/jiti', () => ({
  createJiti: mockCreateJiti,
}))

describe('importModule', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('filePath parameter', () => {
    test('converts a string path via pathToFileURL then fileURLToPath', async () => {
      const moduleExport = {foo: 'bar'}
      mockJitiImport.mockResolvedValue(moduleExport)

      await importModule('/some/path/to/module.ts')

      const expected = fileURLToPath(pathToFileURL('/some/path/to/module.ts'))
      expect(mockJitiImport).toHaveBeenCalledWith(expected, expect.any(Object))
    })

    test('accepts a URL object and passes fileURLToPath(url) to jiti.import', async () => {
      mockJitiImport.mockResolvedValue({})

      const url = pathToFileURL('/another/path/module.ts')
      await importModule(url)

      expect(mockJitiImport).toHaveBeenCalledWith(fileURLToPath(url), expect.any(Object))
    })
  })

  describe('options.default', () => {
    test('defaults to passing {default: true} when omitted', async () => {
      mockJitiImport.mockResolvedValue({})

      await importModule('/module.ts')

      expect(mockJitiImport).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({default: true}),
      )
    })

    test('does not include default key when set to false', async () => {
      mockJitiImport.mockResolvedValue({})

      await importModule('/module.ts', {default: false})

      const jitiOptions = mockJitiImport.mock.calls[0][1] as Record<string, unknown>
      expect('default' in jitiOptions).toBe(false)
    })
  })

  describe('options.tsconfigPath', () => {
    test('passes string tsconfigPath as tsconfigPaths to createJiti', async () => {
      mockJitiImport.mockResolvedValue({})

      await importModule('/module.ts', {tsconfigPath: '/custom/tsconfig.json'})

      expect(mockCreateJiti).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({tsconfigPaths: '/custom/tsconfig.json'}),
      )
    })

    test('passes true as tsconfigPaths when tsconfigPath is undefined', async () => {
      mockJitiImport.mockResolvedValue({})

      await importModule('/module.ts')

      expect(mockCreateJiti).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({tsconfigPaths: true}),
      )
    })
  })

  describe('return value', () => {
    test('returns the value resolved by jiti.import', async () => {
      const expected = {config: {api: {projectId: 'abc'}}}
      mockJitiImport.mockResolvedValue(expected)

      const result = await importModule('/module.ts')

      expect(result).toBe(expected)
    })
  })

  describe('error propagation', () => {
    test('rejects with the same error when jiti.import rejects', async () => {
      const error = new Error('Module not found')
      mockJitiImport.mockRejectedValue(error)

      await expect(importModule('/missing.ts')).rejects.toThrow(error)
    })
  })

  describe('createJiti initialization', () => {
    test('passes debug.enabled as the debug option', async () => {
      mockJitiImport.mockResolvedValue({})

      await importModule('/module.ts')

      const jitiConfig = mockCreateJiti.mock.calls[0][1] as Record<string, unknown>
      expect('debug' in jitiConfig).toBe(true)
    })
  })
})
