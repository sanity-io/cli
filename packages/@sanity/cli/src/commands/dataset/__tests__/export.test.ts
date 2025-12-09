import fs from 'node:fs/promises'

import {input, select} from '@inquirer/prompts'
import {runCommand} from '@oclif/test'
import {type CliConfig, getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {exportDataset, type ExportResult} from '@sanity/export'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DatasetExportCommand} from '../export.js'

vi.mock('@sanity/export', () => ({
  exportDataset: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../../../cli-core/src/services/apiClient.js', () => ({
  getProjectCliClient: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn(),
  },
}))

const mockExportDataset = vi.mocked(exportDataset)
const mockInput = vi.mocked(input)
const mockSelect = vi.mocked(select)
const mockGetCliConfig = vi.mocked(getCliConfig)
const mockGetProjectCliClient = vi.mocked(getProjectCliClient)
const mockFs = vi.mocked(fs)

const TEST_CONFIG = {
  DATASET: 'production',
  PROJECT_ID: 'test-project',
} as const

const TEST_OUTPUTS = {
  EXISTING: 'existing.tar.gz',
  STDOUT: '-',
  SUBDIR: 'subdir/output.tar.gz',
  TAR_GZ: 'output.tar.gz',
} as const

const ERROR_MESSAGES = {
  ALREADY_EXISTS: 'already exists',
  DATASET_NOT_FOUND: 'Dataset with name',
  EXPORT_FAILED: 'Export failed',
  USE_OVERWRITE: '--overwrite',
} as const

const createTestContext = (
  overrides: {
    dataset?: string | null
    datasets?: Array<{name: string}>
    fileExists?: boolean
    inputValue?: string
    isFile?: boolean
    projectId?: string
    selectValue?: string
  } = {},
) => {
  const defaults = {
    dataset: TEST_CONFIG.DATASET,
    datasets: [{name: 'production'}, {name: 'staging'}],
    fileExists: false,
    isFile: true,
    projectId: TEST_CONFIG.PROJECT_ID,
  }

  const context = {...defaults, ...overrides}

  // Setup CLI config
  const apiConfig: CliConfig['api'] = {projectId: context.projectId}
  if (context.dataset) apiConfig.dataset = context.dataset

  mockGetCliConfig.mockResolvedValue({api: apiConfig})

  // Setup project client
  mockGetProjectCliClient.mockResolvedValue({
    datasets: {
      list: vi.fn().mockResolvedValue(context.datasets),
    },
  } as never)

  // Setup file system
  if (context.fileExists) {
    mockFs.stat.mockResolvedValue({
      isFile: () => context.isFile,
    } as never)
  } else {
    mockFs.stat.mockRejectedValue(new Error('File not found'))
  }

  // Setup select if provided
  if (context.selectValue) {
    mockSelect.mockResolvedValueOnce(context.selectValue)
  }

  // Setup input if provided
  if (context.inputValue) {
    mockInput.mockResolvedValueOnce(context.inputValue)
  }

  return context
}

describe('#dataset:export', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['dataset:export', '--help'])

    expect(stdout).toContain('Export dataset to local filesystem as a gzipped tarball')
    expect(stdout).toContain('ARGUMENTS')
    expect(stdout).toContain('EXAMPLES')
    expect(stdout).toContain('--no-assets')
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

        const {stdout} = await testCommand(DatasetExportCommand, args)

        expect(mockExportDataset).toHaveBeenCalledWith(
          expect.objectContaining({
            assetConcurrency: 8,
            assets: true,
            client: expect.any(Object),
            compress: true,
            dataset: 'production',
            drafts: true,
            mode: 'stream',
            onProgress: expect.any(Function),
            outputPath: expect.stringMatching(expectedPathPattern),
            raw: false,
            types: undefined,
          }),
        )

        if (shouldShowDetails) {
          expect(stdout).toContain('projectId: test-project')
          expect(stdout).toContain('dataset: production')
          expect(stdout).toContain('Export finished')
        }
      },
    )

    test('exports to stdout with dash', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.STDOUT])

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          outputPath: TEST_OUTPUTS.STDOUT,
        }),
      )
    })

    test('prompts for destination when not provided as argument', async () => {
      createTestContext({
        datasets: [{name: 'production'}],
        inputValue: '/custom/path/export.tar.gz',
      })

      await testCommand(DatasetExportCommand, ['production'])

      expect(mockInput).toHaveBeenCalledWith({
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
      createTestContext({
        dataset: null, // No default dataset
        inputValue: 'staging.tar.gz', // Mock destination input
        selectValue: 'staging',
      })

      await testCommand(DatasetExportCommand, [])

      expect(mockSelect).toHaveBeenCalledWith({
        choices: [
          {name: 'production', value: 'production'},
          {name: 'staging', value: 'staging'},
        ],
        message: 'Select the dataset name:',
      })
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

      const {stdout} = await testCommand(DatasetExportCommand, [])

      expect(stdout).toContain('Using default dataset: staging')
      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          dataset: 'staging',
        }),
      )
    })

    test('validates dataset exists in project', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      const {error} = await testCommand(DatasetExportCommand, ['staging', TEST_OUTPUTS.TAR_GZ])

      expect(error?.message).toContain(`${ERROR_MESSAGES.DATASET_NOT_FOUND} "staging" not found`)
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('file operations', () => {
    test('creates parent directory for nested output paths', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.SUBDIR])

      expect(mockFs.mkdir).toHaveBeenCalledWith(expect.stringMatching(/subdir$/), {
        recursive: true,
      })
    })

    test('prevents overwrite without flag', async () => {
      createTestContext({
        datasets: [{name: 'production'}],
        fileExists: true,
      })

      const {error} = await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.EXISTING])

      expect(error?.message).toContain(ERROR_MESSAGES.ALREADY_EXISTS)
      expect(error?.message).toContain(ERROR_MESSAGES.USE_OVERWRITE)
      expect(error?.oclif?.exit).toBe(1)
    })

    test('allows overwrite with flag', async () => {
      createTestContext({
        datasets: [{name: 'production'}],
        fileExists: true,
      })

      await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.EXISTING, '--overwrite'])

      expect(mockExportDataset).toHaveBeenCalled()
    })

    test('handles directory creation errors gracefully', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      // Mock mkdir to throw a permission error
      const permissionError = new Error('Permission denied') as Error & {code: string}
      permissionError.code = 'EACCES'
      mockFs.mkdir.mockRejectedValueOnce(permissionError)

      const {error} = await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.SUBDIR])

      expect(error?.message).toContain('Permission denied: Cannot create directory')
      expect(error?.message).toContain('Please check write permissions')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles other directory creation errors gracefully', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      // Mock mkdir to throw a generic error
      const genericError = new Error('Disk full')
      mockFs.mkdir.mockRejectedValueOnce(genericError)

      const {error} = await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.SUBDIR])

      expect(error?.message).toContain('Failed to create directory')
      expect(error?.message).toContain('Disk full')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('export options', () => {
    test('sets assets:false when --no-assets flag is used', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.TAR_GZ, '--no-assets'])

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          assets: false,
        }),
      )
    })

    test('parses comma-separated types with --types flag', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await testCommand(DatasetExportCommand, [
        'production',
        TEST_OUTPUTS.TAR_GZ,
        '--types',
        'post,author',
      ])

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['post', 'author'],
        }),
      )
    })

    test('sets raw:true when --raw flag is used', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.TAR_GZ, '--raw'])

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          raw: true,
        }),
      )
    })

    test('sets mode to cursor with --mode flag', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      await testCommand(DatasetExportCommand, [
        'production',
        TEST_OUTPUTS.TAR_GZ,
        '--mode',
        'cursor',
      ])

      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'cursor',
        }),
      )
    })
  })

  describe('error handling', () => {
    test('fails without project ID', async () => {
      createTestContext({projectId: undefined as never})

      const {error} = await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.TAR_GZ])

      expect(error?.message).toEqual(NO_PROJECT_ID)
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles cancelled dataset selection gracefully', async () => {
      createTestContext({
        dataset: null, // No default dataset
      })

      // Mock select to simulate user cancellation (Ctrl+C throws an error)
      mockSelect.mockRejectedValueOnce(new Error('User cancelled'))

      const {error} = await testCommand(DatasetExportCommand, [])

      expect(error?.message).toContain('User cancelled')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles export errors with detailed error message', async () => {
      createTestContext({datasets: [{name: 'production'}]})
      const exportError = new Error('Network timeout during export')
      mockExportDataset.mockRejectedValueOnce(exportError)

      const {error} = await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.TAR_GZ])

      expect(error?.message).toBe(`${ERROR_MESSAGES.EXPORT_FAILED}: Network timeout during export`)
      expect(error?.oclif?.exit).toBe(1)
    })

    test('validates dataset name format', async () => {
      createTestContext({datasets: [{name: 'production'}]})

      const {error} = await testCommand(DatasetExportCommand, [
        'INVALID-DATASET',
        TEST_OUTPUTS.TAR_GZ,
      ])

      expect(error?.message).toContain('lowercase')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles dataset listing errors gracefully', async () => {
      // Setup basic context but override the datasets.list to throw an error
      createTestContext({datasets: [{name: 'production'}]})

      const listError = new Error('Network error: Unable to connect to API')
      mockGetProjectCliClient.mockResolvedValue({
        datasets: {
          list: vi.fn().mockRejectedValue(listError),
        },
      } as never)

      const {error} = await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.TAR_GZ])

      expect(error?.message).toContain('Failed to list datasets:')
      expect(error?.message).toContain('Network error: Unable to connect to API')
      expect(error?.oclif?.exit).toBe(1)
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

      const {stdout} = await testCommand(DatasetExportCommand, ['production', TEST_OUTPUTS.TAR_GZ])

      // Verify command completed successfully
      expect(stdout).toContain('Export finished')
      expect(mockExportDataset).toHaveBeenCalled()
    })
  })
})
