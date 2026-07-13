import {Readable} from 'node:stream'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../../test/mockSanityCommand.js'
import {NEW_DATASET_VALUE} from '../../../prompts/promptForDataset.js'

// First: create the mocks and mocked SanityCommand class
const {MockedSanityCommand, mocks} = createMockSanityCommand()
const mockGetProjectCliClient = vi.hoisted(() => vi.fn().mockResolvedValue({}))
// Second: install the mock on cli-core
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getProjectCliClient: mockGetProjectCliClient,
    SanityCommand: MockedSanityCommand,
  }
})

// Third: mock dataset import command imports
const mockPromptForDataset = vi.hoisted(() => vi.fn())
const mockPromptForDatasetName = vi.hoisted(() => vi.fn())
const mockListDatasets = vi.hoisted(() => vi.fn())
const mockCreateDataset = vi.hoisted(() => vi.fn())
const mockSanityImport = vi.hoisted(() => vi.fn())
const mockCreateReadStream = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())

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
  sanityImport: mockSanityImport,
}))

vi.mock('@sanity/cli-core/request', () => ({
  createRequester: vi.fn().mockReturnValue(mockRequest),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    default: {
      ...actual,
      createReadStream: mockCreateReadStream,
      statSync: vi.fn().mockReturnValue({isDirectory: () => false}),
    },
  }
})

// Finally, import the module under test: dataset import command
const {ImportDatasetCommand} = await import('../import.js')

const TEST_DATASET_NAME = 'test-dataset'
const TEST_PROJECT_ID = '1337newb'
const BASE_FLAGS = ['test-source.ndjson', '--dataset', TEST_DATASET_NAME, '--token', 'test-token']

describe('#dataset:import', () => {
  beforeEach(() => {
    mocks.SanityCmdGetProjectId.mockResolvedValue(TEST_PROJECT_ID)
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockSanityImport.mockResolvedValue({numDocs: 0, warnings: []})
    mockCreateReadStream.mockReturnValue(Readable.from([]))
    mockRequest.mockResolvedValue({body: Readable.from([])})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('successful imports', () => {
    test('from a file source by creating a read stream to the provided file', async () => {
      const sanityImportObj = {numDocs: 42, warnings: []}
      mockSanityImport.mockResolvedValueOnce(sanityImportObj)
      const fakeReadStream = Readable.from([])
      mockCreateReadStream.mockReturnValue(fakeReadStream)

      await ImportDatasetCommand.run(BASE_FLAGS)

      expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
        expect.stringContaining('Done! Imported'),
        sanityImportObj.numDocs,
        TEST_DATASET_NAME,
      )
      expect(mockCreateReadStream).toHaveBeenCalledWith(BASE_FLAGS[0])
      expect(mockSanityImport).toHaveBeenCalledWith(
        fakeReadStream,
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
          targetDataset: TEST_DATASET_NAME,
          targetProjectId: TEST_PROJECT_ID,
        }),
      )
    })

    test('from a URL source by creating a streaming HTTP request to the URL', async () => {
      const sanityImportObj = {numDocs: 3, warnings: []}
      mockSanityImport.mockResolvedValueOnce(sanityImportObj)
      const fakeReadStream = Readable.from([])
      mockRequest.mockResolvedValue({body: fakeReadStream})

      await ImportDatasetCommand.run(['https://example.com/data.ndjson', ...BASE_FLAGS.slice(1)])

      expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
        expect.stringContaining('Done! Imported'),
        sanityImportObj.numDocs,
        TEST_DATASET_NAME,
      )
      expect(mockSanityImport).toHaveBeenCalledWith(fakeReadStream, expect.any(Object))
    })

    test('imports from stdin when source is "-"', async () => {
      const sanityImportObj = {numDocs: 3, warnings: []}
      mockSanityImport.mockResolvedValueOnce(sanityImportObj)

      await ImportDatasetCommand.run(['-', ...BASE_FLAGS.slice(1)])

      expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
        expect.stringContaining('Done! Imported'),
        sanityImportObj.numDocs,
        TEST_DATASET_NAME,
      )
      expect(mockSanityImport).toHaveBeenCalledWith(process.stdin, expect.any(Object))
    })
  })

  describe('dataset resolution', () => {
    test('uses --dataset flag', async () => {
      await ImportDatasetCommand.run(BASE_FLAGS)
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({dataset: TEST_DATASET_NAME}),
      )
    })

    test('accepts positional dataset argument for backwards compatibility', async () => {
      await ImportDatasetCommand.run([
        'test-source.ndjson',
        'positional-dataset',
        '--token',
        'test-token',
      ])
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({dataset: 'positional-dataset'}),
      )
      expect(mocks.SanityCmdOutputWarn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Positional dataset argument is deprecated. Use the --dataset flag instead',
        ),
      )
    })

    test('--dataset flag takes precedence over positional argument', async () => {
      await ImportDatasetCommand.run([
        'test-source.ndjson',
        'positional-dataset',
        '--dataset',
        'flag-dataset',
        '--token',
        'test-token',
      ])

      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({dataset: 'flag-dataset'}),
      )
      expect(mocks.SanityCmdOutputWarn).not.toHaveBeenCalledWith(
        expect.stringContaining(
          'Positional dataset argument is deprecated. Use the --dataset flag instead',
        ),
      )
    })

    test('prompts for dataset when none provided in interactive mode', async () => {
      mocks.SanityCmdIsUnattended.mockReturnValue(false)
      mockListDatasets.mockResolvedValueOnce([{name: 'production'}, {name: 'staging'}])
      const selectedDataset = 'staging'
      mockPromptForDataset.mockResolvedValueOnce(selectedDataset)
      const sanityImportObj = {numDocs: 3, warnings: []}
      mockSanityImport.mockResolvedValueOnce(sanityImportObj)

      await ImportDatasetCommand.run(['test-source.ndjson', '--token', 'test-token'])

      expect(mockListDatasets).toHaveBeenCalledWith(TEST_PROJECT_ID)
      expect(mockPromptForDataset).toHaveBeenCalledWith({
        allowCreation: true,
        datasets: [{name: 'production'}, {name: 'staging'}],
      })
      expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
        expect.stringContaining('Done! Imported'),
        sanityImportObj.numDocs,
        selectedDataset,
      )
    })

    test('creates new dataset when user selects create option in interactive mode', async () => {
      mocks.SanityCmdIsUnattended.mockReturnValue(false)
      mockListDatasets.mockResolvedValueOnce([{name: 'production'}])
      mockPromptForDataset.mockResolvedValueOnce(NEW_DATASET_VALUE)
      const newDatasetName = 'new-dataset'
      mockPromptForDatasetName.mockResolvedValueOnce(newDatasetName)
      mockCreateDataset.mockResolvedValueOnce({name: newDatasetName})
      const sanityImportObj = {numDocs: 3, warnings: []}
      mockSanityImport.mockResolvedValueOnce(sanityImportObj)

      await ImportDatasetCommand.run(['test-source.ndjson', '--token', 'test-token'])

      expect(mockPromptForDatasetName).toHaveBeenCalled()
      expect(mockCreateDataset).toHaveBeenCalledWith({
        datasetName: newDatasetName,
        projectId: TEST_PROJECT_ID,
      })
      expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
        expect.stringContaining('Done! Imported'),
        sanityImportObj.numDocs,
        newDatasetName,
      )
    })
  })

  describe('error handling', () => {
    test('errors when no dataset is provided in non-interactive mode', async () => {
      mocks.SanityCmdIsUnattended.mockReturnValue(true)
      await ImportDatasetCommand.run(['test-source.ndjson', '--token', 'test-token'])

      expect(mockListDatasets).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(
        expect.stringContaining('Missing dataset'),
        {exit: 2},
      )
    })

    test('errors when dataset creation fails in interactive mode', async () => {
      mocks.SanityCmdIsUnattended.mockReturnValue(false)
      mockListDatasets.mockResolvedValueOnce([{name: 'production'}])
      mockPromptForDataset.mockResolvedValueOnce(NEW_DATASET_VALUE)
      const newDatasetName = 'bad-dataset'
      mockPromptForDatasetName.mockResolvedValueOnce(newDatasetName)
      mockCreateDataset.mockRejectedValueOnce(new Error('Dataset creation failed'))

      await ImportDatasetCommand.run(['test-source.ndjson', '--token', 'test-token'])

      expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to create dataset ${newDatasetName}`),
        {exit: 1},
      )
    })

    test('import failure', async () => {
      const err = 'Connection timeout'
      mockSanityImport.mockRejectedValueOnce(new Error(err))

      await ImportDatasetCommand.run(BASE_FLAGS)

      expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(expect.stringContaining(err), {
        exit: 1,
      })
    })

    test('clears spinInterval on error after onProgress starts', async () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
      const err = 'Import failed mid-progress'

      mockSanityImport.mockImplementationOnce(async (_stream, opts) => {
        // Trigger onProgress with a non-computable step to start spinInterval
        opts.onProgress!({step: 'Importing documents'})
        throw new Error(err)
      })

      await ImportDatasetCommand.run(BASE_FLAGS)

      expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(expect.stringContaining(err), {
        exit: 1,
      })
      // Verify clearInterval was called to clean up the spinInterval
      expect(clearIntervalSpy).toHaveBeenCalled()

      clearIntervalSpy.mockRestore()
    })

    test('handles ReplacementCharError with hint about --allow-replacement-characters', async () => {
      const err = new Error('Connection timeout')
      err.name = 'ReplacementCharError'
      mockSanityImport.mockRejectedValueOnce(err)

      await ImportDatasetCommand.run(BASE_FLAGS)

      expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(
        expect.stringContaining(err.message),
        {
          exit: 1,
        },
      )
    })
  })

  describe('operation flags', () => {
    test('--replace sets createOrReplace operation', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 10, warnings: []})

      await ImportDatasetCommand.run([...BASE_FLAGS, '--replace'])

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

      await ImportDatasetCommand.run([...BASE_FLAGS, '--missing'])

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

      await ImportDatasetCommand.run([...BASE_FLAGS, '--asset-concurrency', '4'])

      expect(mockSanityImport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          assetConcurrency: 4,
        }),
      )
    })

    test('--token is passed to client creation', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 0, warnings: []})

      await ImportDatasetCommand.run(BASE_FLAGS)

      expect(mockGetProjectCliClient).toHaveBeenCalledWith({
        apiVersion: 'v2025-02-19',
        dataset: TEST_DATASET_NAME,
        projectId: TEST_PROJECT_ID,
        requireUser: true,
        token: 'test-token',
      })
    })

    test('omits passing token to client creation when --token is not provided', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 5, warnings: []})

      await ImportDatasetCommand.run(BASE_FLAGS.slice(0, 3))

      expect(mockGetProjectCliClient).toHaveBeenCalledWith({
        apiVersion: 'v2025-02-19',
        dataset: TEST_DATASET_NAME,
        projectId: TEST_PROJECT_ID,
        requireUser: true,
      })
    })
  })

  describe('progress callback', () => {
    test('passes onProgress callback to sanityImport', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 10, warnings: []})

      await ImportDatasetCommand.run(BASE_FLAGS)

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

      await ImportDatasetCommand.run(BASE_FLAGS)

      expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
        expect.stringContaining('Done! Imported'),
        20,
        expect.any(String),
      )
    })
  })

  describe('warnings', () => {
    test('only prints asset failure warnings', async () => {
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
          {message: 'Some non-asset warning'},
        ],
      })

      await ImportDatasetCommand.run(BASE_FLAGS)

      expect(mocks.SanityCmdOutputWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import the following asset'),
      )
      expect(mocks.SanityCmdOutputWarn).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com/img.png'),
      )
      expect(mocks.SanityCmdOutputWarn).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com/doc.pdf'),
      )
    })
  })
})
