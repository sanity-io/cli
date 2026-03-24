import {Readable} from 'node:stream'

import {getProjectCliClient, ProjectRootNotFoundError} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {sanityImport} from '@sanity/import'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NEW_DATASET_VALUE} from '../../../prompts/promptForDataset.js'
import {ImportDatasetCommand} from '../import.js'

const mockPromptForDataset = vi.hoisted(() => vi.fn())
const mockPromptForDatasetName = vi.hoisted(() => vi.fn())
const mockListDatasets = vi.hoisted(() => vi.fn())
const mockCreateDataset = vi.hoisted(() => vi.fn())

vi.mock('../../../prompts/promptForDataset.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../prompts/promptForDataset.js')>()
  return {
    ...actual,
    promptForDataset: mockPromptForDataset,
  }
})

vi.mock('../../../prompts/promptForDatasetName.js', () => ({
  promptForDatasetName: mockPromptForDatasetName,
}))

vi.mock('../../../services/datasets.js', () => ({
  createDataset: mockCreateDataset,
  listDatasets: mockListDatasets,
}))

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

const defaultMocks = {
  cliConfig: {api: {dataset: 'test-dataset', projectId: 'test-project'}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const BASE_FLAGS = ['test-source.ndjson', '--dataset', 'test-dataset', '--token', 'test-token']

describe('#dataset:import', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('successful imports', () => {
    test('imports from a file source', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 42, warnings: []})

      const {error, stdout} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

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

      const {error, stdout} = await testCommand(
        ImportDatasetCommand,
        ['https://example.com/data.ndjson', '--dataset', 'test-dataset', '--token', 'test-token'],
        {mocks: defaultMocks},
      )

      if (error) throw error
      expect(stdout).toContain('Done! Imported 3 documents to dataset "test-dataset"')
      expect(mockSanityImport).toHaveBeenCalledWith(expect.anything(), expect.any(Object))
    })

    test('imports from stdin when source is "-"', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 5, warnings: []})

      const {error, stdout} = await testCommand(
        ImportDatasetCommand,
        ['-', '--dataset', 'test-dataset', '--token', 'test-token'],
        {mocks: defaultMocks},
      )

      if (error) throw error
      expect(stdout).toContain('Done! Imported 5 documents to dataset "test-dataset"')
      expect(mockSanityImport).toHaveBeenCalledWith(process.stdin, expect.any(Object))
    })
  })

  describe('dataset resolution', () => {
    test('uses --dataset flag', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 1, warnings: []})

      const {error} = await testCommand(
        ImportDatasetCommand,
        ['test-source.ndjson', '--dataset', 'my-dataset', '--token', 'test-token'],
        {mocks: defaultMocks},
      )

      if (error) throw error
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({dataset: 'my-dataset'}),
      )
    })

    test('accepts positional dataset argument for backwards compatibility', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 1, warnings: []})

      const {error, stderr} = await testCommand(
        ImportDatasetCommand,
        ['test-source.ndjson', 'positional-dataset', '--token', 'test-token'],
        {mocks: defaultMocks},
      )

      if (error) throw error
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({dataset: 'positional-dataset'}),
      )
      expect(stderr).toContain('Positional dataset argument is deprecated')
      expect(stderr).toContain('--dataset')
    })

    test('--dataset flag takes precedence over positional argument', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 1, warnings: []})

      const {error, stderr} = await testCommand(
        ImportDatasetCommand,
        [
          'test-source.ndjson',
          'positional-dataset',
          '--dataset',
          'flag-dataset',
          '--token',
          'test-token',
        ],
        {mocks: defaultMocks},
      )

      if (error) throw error
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({dataset: 'flag-dataset'}),
      )
      expect(stderr).not.toContain('Positional dataset argument is deprecated')
    })

    test('errors when no dataset is provided in non-interactive mode', async () => {
      const {error} = await testCommand(
        ImportDatasetCommand,
        ['test-source.ndjson', '--token', 'test-token'],
        {mocks: defaultMocks},
      )

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Missing dataset')
      expect(error?.message).toContain('--dataset')
      expect(error?.oclif?.exit).toBe(1)
      expect(mockListDatasets).not.toHaveBeenCalled()
    })

    test('prompts for dataset when none provided in interactive mode', async () => {
      const originalIsTTY = process.stdin.isTTY
      const originalCI = process.env.CI
      process.stdin.isTTY = true
      delete process.env.CI

      try {
        mockListDatasets.mockResolvedValueOnce([{name: 'production'}, {name: 'staging'}])
        mockPromptForDataset.mockResolvedValueOnce('staging')
        mockSanityImport.mockResolvedValueOnce({numDocs: 5, warnings: []})

        const {error, stdout} = await testCommand(
          ImportDatasetCommand,
          ['test-source.ndjson', '--token', 'test-token'],
          {mocks: defaultMocks},
        )

        if (error) throw error
        expect(mockListDatasets).toHaveBeenCalledWith('test-project')
        expect(mockPromptForDataset).toHaveBeenCalledWith({
          allowCreation: true,
          datasets: [{name: 'production'}, {name: 'staging'}],
        })
        expect(stdout).toContain('Done! Imported 5 documents to dataset "staging"')
      } finally {
        process.stdin.isTTY = originalIsTTY
        if (originalCI === undefined) {
          delete process.env.CI
        } else {
          process.env.CI = originalCI
        }
      }
    })

    test('creates new dataset when user selects create option in interactive mode', async () => {
      const originalIsTTY = process.stdin.isTTY
      const originalCI = process.env.CI
      process.stdin.isTTY = true
      delete process.env.CI

      try {
        mockListDatasets.mockResolvedValueOnce([{name: 'production'}])
        mockPromptForDataset.mockResolvedValueOnce(NEW_DATASET_VALUE)
        mockPromptForDatasetName.mockResolvedValueOnce('new-dataset')
        mockCreateDataset.mockResolvedValueOnce({name: 'new-dataset'})
        mockSanityImport.mockResolvedValueOnce({numDocs: 3, warnings: []})

        const {error, stdout} = await testCommand(
          ImportDatasetCommand,
          ['test-source.ndjson', '--token', 'test-token'],
          {mocks: defaultMocks},
        )

        if (error) throw error
        expect(mockPromptForDatasetName).toHaveBeenCalled()
        expect(mockCreateDataset).toHaveBeenCalledWith({
          datasetName: 'new-dataset',
          projectId: 'test-project',
        })
        expect(stdout).toContain('Done! Imported 3 documents to dataset "new-dataset"')
      } finally {
        process.stdin.isTTY = originalIsTTY
        if (originalCI === undefined) {
          delete process.env.CI
        } else {
          process.env.CI = originalCI
        }
      }
    })

    test('errors when dataset creation fails in interactive mode', async () => {
      const originalIsTTY = process.stdin.isTTY
      const originalCI = process.env.CI
      process.stdin.isTTY = true
      delete process.env.CI

      try {
        mockListDatasets.mockResolvedValueOnce([{name: 'production'}])
        mockPromptForDataset.mockResolvedValueOnce(NEW_DATASET_VALUE)
        mockPromptForDatasetName.mockResolvedValueOnce('bad-dataset')
        mockCreateDataset.mockRejectedValueOnce(new Error('Dataset creation failed'))

        const {error} = await testCommand(
          ImportDatasetCommand,
          ['test-source.ndjson', '--token', 'test-token'],
          {mocks: defaultMocks},
        )

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toContain('Failed to create dataset bad-dataset')
        expect(error?.message).toContain('Dataset creation failed')
        expect(error?.oclif?.exit).toBe(1)
      } finally {
        process.stdin.isTTY = originalIsTTY
        if (originalCI === undefined) {
          delete process.env.CI
        } else {
          process.env.CI = originalCI
        }
      }
    })
  })

  describe('project ID resolution', () => {
    test('falls back to CLI config project ID', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 1, warnings: []})

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

      if (error) throw error
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({projectId: 'test-project'}),
      )
    })

    test('--project-id flag overrides CLI config', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 1, warnings: []})

      const {error} = await testCommand(
        ImportDatasetCommand,
        [...BASE_FLAGS, '--project-id', 'flag-project'],
        {mocks: defaultMocks},
      )

      if (error) throw error
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({projectId: 'flag-project'}),
      )
    })

    test('supports deprecated --project flag', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 1, warnings: []})

      const {error, stderr} = await testCommand(
        ImportDatasetCommand,
        [...BASE_FLAGS, '--project', 'deprecated-project'],
        {
          mocks: {
            ...defaultMocks,
            cliConfig: {api: {dataset: 'test-dataset'}},
          },
        },
      )

      if (error) throw error
      expect(stderr).toContain('"project" flag has been deprecated')
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({projectId: 'deprecated-project'}),
      )
    })

    test('errors when no project root and no --project-id', async () => {
      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: {
          cliConfigError: new ProjectRootNotFoundError('No project root found'),
          token: 'test-token',
        },
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Unable to determine project ID')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('operation flags', () => {
    test('--replace sets createOrReplace operation', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 10, warnings: []})

      const {error} = await testCommand(ImportDatasetCommand, [...BASE_FLAGS, '--replace'], {
        mocks: defaultMocks,
      })

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

      const {error} = await testCommand(ImportDatasetCommand, [...BASE_FLAGS, '--missing'], {
        mocks: defaultMocks,
      })

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

      const {error} = await testCommand(
        ImportDatasetCommand,
        [...BASE_FLAGS, '--asset-concurrency', '4'],
        {mocks: defaultMocks},
      )

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
    test('handles import failure', async () => {
      mockSanityImport.mockRejectedValueOnce(new Error('Connection timeout'))

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Connection timeout')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('clears spinInterval on error after onProgress starts', async () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

      mockSanityImport.mockImplementationOnce(async (_stream, opts) => {
        // Trigger onProgress with a non-computable step to start spinInterval
        opts.onProgress!({step: 'Importing documents'})
        throw new Error('Import failed mid-progress')
      })

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Import failed mid-progress')
      // Verify clearInterval was called to clean up the spinInterval
      expect(clearIntervalSpy).toHaveBeenCalled()

      clearIntervalSpy.mockRestore()
    })

    test('handles ReplacementCharError with hint about --allow-replacement-characters', async () => {
      const replacementError = new Error('Found replacement characters in document "doc1"')
      replacementError.name = 'ReplacementCharError'
      mockSanityImport.mockRejectedValueOnce(replacementError)

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('unicode replacement characters')
      expect(error?.message).toContain('--allow-replacement-characters')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('progress callback', () => {
    test('passes onProgress callback to sanityImport', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 10, warnings: []})

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

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

      const {error, stdout} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

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

      const {error, stderr} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

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

      const {error, stderr} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

      if (error) throw error
      expect(stderr).not.toContain('Failed to import')
    })
  })

  describe('client configuration', () => {
    test('creates client with correct options when --token is provided', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 0, warnings: []})

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

      if (error) throw error
      expect(mockGetProjectCliClient).toHaveBeenCalledWith({
        apiVersion: 'v2025-02-19',
        dataset: 'test-dataset',
        projectId: 'test-project',
        requireUser: true,
        token: 'test-token',
      })
    })

    test('uses stored CLI token when --token is not provided', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 5, warnings: []})

      const {error, stdout} = await testCommand(
        ImportDatasetCommand,
        ['test-source.ndjson', '--dataset', 'test-dataset'],
        {mocks: defaultMocks},
      )

      if (error) throw error
      expect(stdout).toContain('Done! Imported 5 documents')
      expect(mockGetProjectCliClient).toHaveBeenCalledWith({
        apiVersion: 'v2025-02-19',
        dataset: 'test-dataset',
        projectId: 'test-project',
        requireUser: true,
      })
    })
  })
})
