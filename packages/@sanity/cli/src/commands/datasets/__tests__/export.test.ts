import fs from 'node:fs/promises'

import {type CliConfig} from '@sanity/cli-core/types'
import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import * as uxMocks from '@sanity/cli-test/mocks/cli-core/ux'
import {exportDataset, type ExportResult} from '@sanity/export'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DatasetExportCommand} from '../export.js'

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('@sanity/cli-core/apiClient', () => import('@sanity/cli-test/mocks/cli-core/apiClient'))
vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('@sanity/client', () => ({}))
vi.mock('@sanity/export', () => ({
  exportDataset: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn(),
  },
}))
vi.mock('../../../prompts/promptForProject.js', () => ({
  promptForProject: vi.fn(),
}))
const mockPromptForDataset = vi.hoisted(() => vi.fn())
vi.mock('../../../prompts/promptForDataset.js', () => ({
  promptForDataset: mockPromptForDataset,
}))
const mockListDatasets = vi.hoisted(() => vi.fn())
vi.mock('../../../services/datasets.js', () => ({
  listDatasets: mockListDatasets,
}))

const mockExportDataset = vi.mocked(exportDataset)
const mockFs = vi.mocked(fs)

const TEST_CONFIG = {
  DATASET: 'production',
  PROJECT_ID: 'test-project',
} as const

const TEST_OUTPUTS = {
  EXISTING: 'existing.tar.gz',
  SUBDIR: 'subdir/output.tar.gz',
  TAR_GZ: 'output.tar.gz',
} as const

const ERROR_MESSAGES = {
  ALREADY_EXISTS: 'already exists',
  DATASET_NOT_FOUND: 'Dataset with name',
  EXPORT_FAILED: 'Export failed',
  USE_OVERWRITE: '--overwrite',
} as const

interface TestContextOptions {
  cliConfig?: object
  dataset?: string | null
  datasets?: Array<{name: string}>
  fileExists?: boolean
  inputValue?: string
  isFile?: boolean
  projectId?: string
}

const createTestContext = (overrides: TestContextOptions = {}) => {
  const defaults = {
    dataset: TEST_CONFIG.DATASET,
    datasets: [{name: 'production'}, {name: 'staging'}],
    fileExists: false,
    isFile: true,
    projectId: TEST_CONFIG.PROJECT_ID,
  }

  const context = {...defaults, ...overrides}

  // Setup file system
  if (context.fileExists) {
    mockFs.stat.mockResolvedValue({
      isFile: () => context.isFile,
    } as never)
  } else {
    mockFs.stat.mockRejectedValue(new Error('File not found'))
  }

  // Setup input if provided
  if (context.inputValue) {
    uxMocks.input.mockResolvedValueOnce(context.inputValue)
  }

  const apiConfig: CliConfig['api'] = {projectId: context.projectId}
  if (context.dataset) apiConfig.dataset = context.dataset

  mocks.SanityCmdGetCliConfig.mockResolvedValue(context.cliConfig ?? {api: apiConfig})
  mocks.SanityCmdGetProjectId.mockResolvedValue(context.projectId)
  mockListDatasets.mockResolvedValue(context.datasets)
}

describe('#dataset:export', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('successful exports', () => {
    test.each([
      {
        args: ['production', TEST_OUTPUTS.TAR_GZ],
        description: 'with specified file',
        expectedPathPattern: /output\.tar\.gz$/,
        shouldShowDetails: true,
      },
      {
        args: ['production'],
        description: 'with auto-generated filename when no destination provided via prompt',
        expectedPathPattern: /custom-output\.tar\.gz$/,
        inputValue: 'custom-output.tar.gz',
        shouldShowDetails: false,
      },
    ])(
      'exports dataset $description',
      async ({args, expectedPathPattern, inputValue, shouldShowDetails}) => {
        createTestContext({datasets: [{name: 'production'}], inputValue})

        await DatasetExportCommand.run(args)

        expect(mockExportDataset).toHaveBeenCalledWith(
          expect.objectContaining({
            assetConcurrency: 8,
            assets: true,
            compress: true,
            dataset: 'production',
            drafts: true,
            mode: 'stream',
            onProgress: expect.any(Function),
            outputPath: expect.stringMatching(expectedPathPattern),
            raw: false,
            strictAssetVerification: true,
            types: undefined,
          }),
        )

        expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
        if (shouldShowDetails) {
          expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
            expect.stringContaining('projectId: test-project'),
          )
          expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
            expect.stringContaining('dataset: production'),
          )
          expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
            expect.stringContaining('Export finished'),
          )
        }
      },
    )

    test('exports to stdout with dash', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await DatasetExportCommand.run(['production', '-'])

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          outputPath: process.stdout,
        }),
      )
    })

    test('prompts for destination when not provided as argument', async () => {
      createTestContext({
        datasets: [{name: 'production'}],
        inputValue: '/custom/path/export.tar.gz',
      })

      await DatasetExportCommand.run(['production'])

      expect(uxMocks.input).toHaveBeenCalledWith({
        default: expect.stringMatching(/production\.tar\.gz$/),
        message: 'Output path:',
        transformer: expect.any(Function),
        validate: expect.any(Function),
      })

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          outputPath: '/custom/path/export.tar.gz',
        }),
      )
    })
  })

  describe('dataset selection', () => {
    test('prompts for dataset selection when none specified', async () => {
      const datasets = [
        {name: 'production', value: 'production'},
        {name: 'staging', value: 'staging'},
      ]
      createTestContext({
        dataset: null, // No default dataset
        datasets,
        inputValue: 'staging.tar.gz', // Mock destination input
      })
      mockPromptForDataset.mockResolvedValue('staging')

      await DatasetExportCommand.run([])

      expect(mockPromptForDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          datasets,
        }),
      )
      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          dataset: 'staging',
        }),
      )
    })

    test('uses and announces default dataset from config', async () => {
      createTestContext({
        dataset: 'staging',
        datasets: [{name: 'staging'}],
        inputValue: 'staging.tar.gz', // Mock destination input
      })

      await DatasetExportCommand.run([])

      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Using default dataset: staging'),
      )
      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          dataset: 'staging',
        }),
      )
    })

    test('validates dataset exists in project', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await DatasetExportCommand.run(['staging', TEST_OUTPUTS.TAR_GZ])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        'Dataset with name "staging" not found',
        {exit: 1},
      )
    })
  })

  describe('file operations', () => {
    test('creates parent directory for nested output paths', async () => {
      createTestContext({datasets: [{name: 'production'}]})
      await DatasetExportCommand.run(['production', TEST_OUTPUTS.SUBDIR])

      expect(mockFs.mkdir).toHaveBeenCalledWith(expect.stringMatching(/subdir$/), {
        recursive: true,
      })
    })

    test('prevents overwrite without flag', async () => {
      createTestContext({
        datasets: [{name: 'production'}],
        fileExists: true,
      })

      await DatasetExportCommand.run(['production', TEST_OUTPUTS.EXISTING])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringContaining(ERROR_MESSAGES.ALREADY_EXISTS),
        {exit: 1},
      )
      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringContaining(ERROR_MESSAGES.USE_OVERWRITE),
        {exit: 1},
      )
    })

    test('allows overwrite with flag', async () => {
      createTestContext({
        datasets: [{name: 'production'}],
        fileExists: true,
      })

      await DatasetExportCommand.run(['production', TEST_OUTPUTS.EXISTING, '--overwrite'])

      expect(mockExportDataset).toHaveBeenCalled()
    })

    test('handles directory creation errors gracefully', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      // Mock mkdir to throw a permission error
      const permissionError = new Error('Permission denied') as Error & {code: string}
      permissionError.code = 'EACCES'
      mockFs.mkdir.mockRejectedValueOnce(permissionError)

      await DatasetExportCommand.run(['production', TEST_OUTPUTS.SUBDIR])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied: Cannot create directory'),
        {exit: 1},
      )
      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('Please check write permissions'),
        {exit: 1},
      )
    })

    test('handles other directory creation errors gracefully', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      // Mock mkdir to throw a generic error
      const genericError = new Error('Disk full')
      mockFs.mkdir.mockRejectedValueOnce(genericError)

      await DatasetExportCommand.run(['production', TEST_OUTPUTS.SUBDIR])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create directory'),
        {exit: 1},
      )
      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('Disk full'),
        {exit: 1},
      )
    })
  })

  describe('export options', () => {
    test('sets assets:false when --no-assets flag is used', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await DatasetExportCommand.run(['production', TEST_OUTPUTS.TAR_GZ, '--no-assets'])

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          assets: false,
        }),
      )
    })

    test('parses comma-separated types with --types flag', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await DatasetExportCommand.run(['production', TEST_OUTPUTS.TAR_GZ, '--types', 'post,author'])

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['post', 'author'],
        }),
      )
    })

    test('sets raw:true when --raw flag is used', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await DatasetExportCommand.run(['production', TEST_OUTPUTS.TAR_GZ, '--raw'])

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          raw: true,
        }),
      )
    })

    test('sets strictAssetVerification:false when --no-strict-asset-verification flag is used', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await DatasetExportCommand.run([
        'production',
        TEST_OUTPUTS.TAR_GZ,
        '--no-strict-asset-verification',
      ])

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          strictAssetVerification: false,
        }),
      )
    })

    test('sets mode to cursor with --mode flag', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await DatasetExportCommand.run(['production', TEST_OUTPUTS.TAR_GZ, '--mode', 'cursor'])

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'cursor',
        }),
      )
    })
  })

  describe('error handling', () => {
    test('handles cancelled dataset selection gracefully', async () => {
      createTestContext({
        dataset: null, // No default dataset
      })

      // User cancellation / Ctrl+C throws an error from promptForDataset
      mockPromptForDataset.mockRejectedValueOnce(new Error('User cancelled'))

      await DatasetExportCommand.run([])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('User cancelled'),
        {exit: 1},
      )
    })

    test('handles export errors with detailed error message', async () => {
      createTestContext({datasets: [{name: 'production'}]})
      const exportError = new Error('Network timeout during export')
      mockExportDataset.mockRejectedValueOnce(exportError)

      await DatasetExportCommand.run(['production', TEST_OUTPUTS.TAR_GZ])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringContaining(exportError.message),
        {exit: 1},
      )
    })

    test('validates dataset name format', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await DatasetExportCommand.run(['PROD-UCTION', TEST_OUTPUTS.TAR_GZ])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('lowercase'),
        {exit: 1},
      )
    })

    test('handles dataset listing errors gracefully', async () => {
      createTestContext({datasets: [{name: 'production'}]})
      const listError = new Error('Network error: Unable to connect to API')
      mockListDatasets.mockRejectedValue(listError)

      await DatasetExportCommand.run(['production', TEST_OUTPUTS.TAR_GZ])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringContaining(listError.message),
        {exit: 1},
      )
    })

    test('handles progress updates correctly', async () => {
      createTestContext({datasets: [{name: 'production'}]})
      let progressHandler: (progress: {
        current: number
        step: string
        total: number
        update?: boolean
      }) => void

      mockExportDataset.mockImplementationOnce(async (options): Promise<ExportResult> => {
        progressHandler = options.onProgress!
        // Simulate progress updates to test that they don't crash
        progressHandler({current: 10, step: 'Exporting documents...', total: 100})
        progressHandler({current: 5, step: 'Exporting assets...', total: 20})
        progressHandler({current: 10, step: 'Exporting assets...', total: 20, update: true})
        return {
          assetCount: 20,
          documentCount: 100,
          outputPath: '/tmp/export.tar.gz',
        }
      })

      await DatasetExportCommand.run(['production', TEST_OUTPUTS.TAR_GZ])

      // Verify command completed successfully
      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mockExportDataset).toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Export finished'),
      )
    })
  })
})
