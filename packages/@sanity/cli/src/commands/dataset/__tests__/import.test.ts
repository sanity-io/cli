import {Readable} from 'node:stream'

import {getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {sanityImport} from '@sanity/import'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ImportDatasetCommand} from '../import.js'

vi.mock('@sanity/import', () => ({
  sanityImport: vi.fn().mockResolvedValue({numDocs: 0, warnings: []}),
}))

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      config: vi.fn().mockReturnValue({dataset: 'test-dataset', projectId: 'test-project'}),
    }),
  }
})

vi.mock('@sanity/cli-core/request', () => ({
  createRequester: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({body: Readable.from([])})),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    default: {
      ...actual,
      createReadStream: vi.fn().mockReturnValue(Readable.from([])),
      statSync: vi.fn().mockReturnValue({isDirectory: () => false}),
    },
  }
})

const mockSanityImport = vi.mocked(sanityImport)
const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

const BASE_FLAGS = [
  'test-source.ndjson',
  '--project-id',
  'test-project',
  '--dataset',
  'test-dataset',
  '--token',
  'test-token',
]

describe('#dataset:import', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('successful imports', () => {
    test('imports from a file source', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 42, warnings: []})

      const {error, stdout} = await testCommand(ImportDatasetCommand, BASE_FLAGS)

      if (error) throw error
      expect(stdout).toContain('Done! Imported 42 documents to dataset "test-dataset"')
      expect(mockSanityImport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          allowAssetsInDifferentDataset: false,
          allowFailingAssets: false,
          allowReplacementCharacters: false,
          allowSystemDocuments: false,
          operation: 'create',
          releasesOperation: 'fail',
          replaceAssets: false,
          skipCrossDatasetReferences: false,
          tag: 'sanity.import',
          targetDataset: 'test-dataset',
          targetProjectId: 'test-project',
        }),
      )
    })

    test('imports from a URL source', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 3, warnings: []})

      const {error, stdout} = await testCommand(ImportDatasetCommand, [
        'https://example.com/data.ndjson',
        '--project-id',
        'test-project',
        '--dataset',
        'test-dataset',
        '--token',
        'test-token',
      ])

      if (error) throw error
      expect(stdout).toContain('Done! Imported 3 documents to dataset "test-dataset"')
      expect(mockSanityImport).toHaveBeenCalledWith(expect.anything(), expect.any(Object))
    })

    test('imports from stdin when source is "-"', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 5, warnings: []})

      const {error, stdout} = await testCommand(ImportDatasetCommand, [
        '-',
        '--project-id',
        'test-project',
        '--dataset',
        'test-dataset',
        '--token',
        'test-token',
      ])

      if (error) throw error
      expect(stdout).toContain('Done! Imported 5 documents to dataset "test-dataset"')
      expect(mockSanityImport).toHaveBeenCalledWith(process.stdin, expect.any(Object))
    })
  })

  describe('operation flags', () => {
    test('--replace sets createOrReplace operation', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 10, warnings: []})

      const {error} = await testCommand(ImportDatasetCommand, [...BASE_FLAGS, '--replace'])

      if (error) throw error
      expect(mockSanityImport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          operation: 'createOrReplace',
          releasesOperation: 'replace',
        }),
      )
    })

    test('--missing sets createIfNotExists operation', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 10, warnings: []})

      const {error} = await testCommand(ImportDatasetCommand, [...BASE_FLAGS, '--missing'])

      if (error) throw error
      expect(mockSanityImport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          operation: 'createIfNotExists',
          releasesOperation: 'ignore',
        }),
      )
    })

    test('--asset-concurrency is passed through', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 10, warnings: []})

      const {error} = await testCommand(ImportDatasetCommand, [
        ...BASE_FLAGS,
        '--asset-concurrency',
        '4',
      ])

      if (error) throw error
      expect(mockSanityImport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          assetConcurrency: 4,
        }),
      )
    })
  })

  describe('error handling', () => {
    test('errors when token is not provided', async () => {
      const {error} = await testCommand(ImportDatasetCommand, [
        'test-source.ndjson',
        '--project-id',
        'test-project',
        '--dataset',
        'test-dataset',
      ])

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('--token')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles import failure', async () => {
      mockSanityImport.mockRejectedValueOnce(new Error('Connection timeout'))

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS)

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Connection timeout')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('clears spinInterval on error after onProgress starts', async () => {
      vi.useFakeTimers()
      try {
        mockSanityImport.mockImplementationOnce(async (_stream, opts) => {
          // Trigger onProgress with a non-computable step to start spinInterval
          opts.onProgress!({step: 'Importing documents'})
          throw new Error('Import failed mid-progress')
        })

        const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS)

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toContain('Import failed mid-progress')
        // Verify no pending timers remain (spinInterval was cleared)
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    })

    test('handles ReplacementCharError with hint about --allow-replacement-characters', async () => {
      const replacementError = new Error('Found replacement characters in document "doc1"')
      replacementError.name = 'ReplacementCharError'
      mockSanityImport.mockRejectedValueOnce(replacementError)

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS)

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('unicode replacement characters')
      expect(error?.message).toContain('--allow-replacement-characters')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('progress callback', () => {
    test('passes onProgress callback to sanityImport', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 10, warnings: []})

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS)

      if (error) throw error
      expect(mockSanityImport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          onProgress: expect.any(Function),
        }),
      )
    })

    test('onProgress handles step transitions without crashing', async () => {
      mockSanityImport.mockImplementationOnce(async (_stream, opts) => {
        const onProgress = opts.onProgress!
        onProgress({current: 5, step: 'Reading documents', total: 10})
        onProgress({current: 10, step: 'Reading documents', total: 10})
        onProgress({current: 1, step: 'Importing documents', total: 20})
        onProgress({current: 20, step: 'Importing documents', total: 20})
        return {numDocs: 20, warnings: []}
      })

      const {error, stdout} = await testCommand(ImportDatasetCommand, BASE_FLAGS)

      if (error) throw error
      expect(stdout).toContain('Done! Imported 20 documents')
    })
  })

  describe('warnings', () => {
    test('prints asset failure warnings', async () => {
      mockSanityImport.mockResolvedValueOnce({
        numDocs: 10,
        // The runtime warnings include type/url fields beyond the declared ImportResult type
        warnings: [
          {message: 'Failed to download asset', type: 'asset', url: 'https://example.com/img.png'},
          {
            message: 'Failed to download asset',
            type: 'asset',
            url: 'https://example.com/doc.pdf',
          },
        ] as unknown as Array<{message: string}>,
      })

      const {error, stderr} = await testCommand(ImportDatasetCommand, BASE_FLAGS)

      if (error) throw error
      expect(stderr).toContain('Failed to import the following assets')
      expect(stderr).toContain('https://example.com/img.png')
      expect(stderr).toContain('https://example.com/doc.pdf')
    })

    test('does not print warnings when there are no asset failures', async () => {
      mockSanityImport.mockResolvedValueOnce({
        numDocs: 10,
        warnings: [{message: 'Some non-asset warning'}],
      })

      const {error, stderr} = await testCommand(ImportDatasetCommand, BASE_FLAGS)

      if (error) throw error
      expect(stderr).not.toContain('Failed to import')
    })
  })

  describe('client configuration', () => {
    test('creates client with correct options', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 0, warnings: []})

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS)

      if (error) throw error
      expect(mockGetProjectCliClient).toHaveBeenCalledWith({
        apiVersion: 'v2025-02-19',
        dataset: 'test-dataset',
        projectId: 'test-project',
        token: 'test-token',
      })
    })
  })

  describe('deprecated flags', () => {
    test('supports deprecated --project flag', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 1, warnings: []})

      const {error, stdout} = await testCommand(ImportDatasetCommand, [
        'test-source.ndjson',
        '--project',
        'test-project',
        '--dataset',
        'test-dataset',
        '--token',
        'test-token',
      ])

      if (error) throw error
      expect(stdout).toContain('Done! Imported 1 documents')
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'test-project',
        }),
      )
    })
  })
})
