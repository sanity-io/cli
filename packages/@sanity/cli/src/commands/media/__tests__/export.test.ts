import fs from 'node:fs/promises'

import {runCommand} from '@oclif/test'
import {type CliConfig, getCliConfig} from '@sanity/cli-core'
import {input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import {exportDataset} from '@sanity/export'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MEDIA_LIBRARY_API_VERSION} from '../../../services/mediaLibraries.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {MediaExportCommand} from '../export.js'

vi.mock('@sanity/export', () => ({
  exportDataset: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: vi.fn(),
    select: vi.fn(),
  }
})

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
const mockFs = vi.mocked(fs)

const TEST_CONFIG = {
  MEDIA_LIBRARY_ID: 'test-media-library',
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
  EXPORT_FAILED: 'Export failed',
  MEDIA_LIBRARY_NOT_FOUND: 'Media library with id',
  NO_MEDIA_LIBRARIES: 'No active media libraries found',
  USE_OVERWRITE: '--overwrite',
} as const

const createTestContext = (
  overrides: {
    fileExists?: boolean
    inputValue?: string
    isFile?: boolean
    mediaLibraries?: Array<{id: string; organizationId: string; status: 'active' | 'inactive'}>
    projectId?: string
    selectValue?: string
  } = {},
) => {
  const defaults = {
    fileExists: false,
    isFile: true,
    mediaLibraries: [
      {id: 'test-media-library', organizationId: 'org-1', status: 'active' as const},
      {id: 'another-library', organizationId: 'org-1', status: 'active' as const},
    ],
    projectId: TEST_CONFIG.PROJECT_ID,
  }

  const context = {...defaults, ...overrides}

  const apiConfig: CliConfig['api'] = {projectId: context.projectId}

  mockGetCliConfig.mockResolvedValue({api: apiConfig})

  if (context.fileExists) {
    mockFs.stat.mockResolvedValue({
      isFile: () => context.isFile,
    } as never)
  } else {
    mockFs.stat.mockRejectedValue(new Error('ENOENT'))
  }

  // Setup prompt mocks
  if (context.inputValue) {
    mockInput.mockResolvedValue(context.inputValue)
  }
  if (context.selectValue) {
    mockSelect.mockResolvedValue(context.selectValue)
  }

  return context
}

describe('#media:export', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    vi.clearAllMocks()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('should show help text correctly', async () => {
    const {stdout} = await runCommand(['media export --help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Export an archive of all file and image assets including their aspect data from the target media library. Video assets are excluded from the export.

      USAGE
        $ sanity media export [DESTINATION] [--asset-concurrency <value>]
          [--media-library-id <value>] [--no-compress] [--overwrite]

      ARGUMENTS
        [DESTINATION]  Output destination file path

      FLAGS
        --asset-concurrency=<value>  [default: 8] Concurrent number of asset downloads
        --media-library-id=<value>   The id of the target media library
        --no-compress                Skips compressing tarball entries (still
                                     generates a gzip file)
        --overwrite                  Overwrite any file with the same name

      DESCRIPTION
        Export an archive of all file and image assets including their aspect data
        from the target media library. Video assets are excluded from the export.

      EXAMPLES
        Export media library interactively

          $ sanity media export

        Export media library to output.tar.gz

          $ sanity media export output.tar.gz

        Export specific media library

          $ sanity media export --media-library-id my-library-id

      "
    `)
  })

  test('should export with provided destination', async () => {
    createTestContext({selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID})

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    const {stderr, stdout} = await testCommand(MediaExportCommand, [TEST_OUTPUTS.TAR_GZ])

    expect(stderr).toBe('')
    expect(stdout).toContain('Exporting from:')
    expect(stdout).toContain(TEST_CONFIG.PROJECT_ID)
    expect(stdout).toContain(TEST_CONFIG.MEDIA_LIBRARY_ID)
    expect(stdout).toContain('Export finished')

    expect(mockExportDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        assetConcurrency: 8,
        compress: true,
        mediaLibraryId: TEST_CONFIG.MEDIA_LIBRARY_ID,
        outputPath: expect.stringContaining(TEST_OUTPUTS.TAR_GZ),
      }),
    )
  })

  test('should export with media library ID flag', async () => {
    createTestContext()

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    const {stderr, stdout} = await testCommand(MediaExportCommand, [
      TEST_OUTPUTS.TAR_GZ,
      '--media-library-id',
      TEST_CONFIG.MEDIA_LIBRARY_ID,
    ])

    expect(stderr).toBe('')
    expect(stdout).toContain('Export finished')

    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockExportDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaLibraryId: TEST_CONFIG.MEDIA_LIBRARY_ID,
      }),
    )
  })

  test('should prompt for media library when not provided', async () => {
    createTestContext({selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID})

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    await testCommand(MediaExportCommand, [TEST_OUTPUTS.TAR_GZ])

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select media library:',
      }),
    )
  })

  test('should prompt for destination when not provided', async () => {
    createTestContext({
      inputValue: TEST_OUTPUTS.TAR_GZ,
      selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID,
    })

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    await testCommand(MediaExportCommand, [])

    expect(mockInput).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Output path:',
      }),
    )
  })

  test('should error when file already exists without overwrite flag', async () => {
    createTestContext({
      fileExists: true,
      selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID,
    })

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    const {error} = await testCommand(MediaExportCommand, [TEST_OUTPUTS.EXISTING])

    expect(error?.message).toContain(ERROR_MESSAGES.ALREADY_EXISTS)
    expect(error?.message).toContain(ERROR_MESSAGES.USE_OVERWRITE)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should overwrite file when overwrite flag is provided', async () => {
    createTestContext({
      fileExists: true,
      selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID,
    })

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    const {stderr, stdout} = await testCommand(MediaExportCommand, [
      TEST_OUTPUTS.EXISTING,
      '--overwrite',
    ])

    expect(stderr).toBe('')
    expect(stdout).toContain('Export finished')
  })

  test('should use directory and append default filename', async () => {
    createTestContext({
      fileExists: true,
      isFile: false,
      selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID,
    })

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    await testCommand(MediaExportCommand, ['some-directory'])

    expect(mockExportDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        outputPath: expect.stringContaining(`${TEST_CONFIG.MEDIA_LIBRARY_ID}-export.tar.gz`),
      }),
    )
  })

  test('should export to stdout when destination is -', async () => {
    createTestContext({selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID})

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    await testCommand(MediaExportCommand, [TEST_OUTPUTS.STDOUT])

    expect(mockExportDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        outputPath: process.stdout,
      }),
    )
  })

  test.each([
    {
      args: [TEST_OUTPUTS.TAR_GZ],
      errorMessage: NO_PROJECT_ID,
      scenario: 'no project ID is found',
      setup: {projectId: ''},
    },
    {
      args: [TEST_OUTPUTS.TAR_GZ],
      errorMessage: ERROR_MESSAGES.NO_MEDIA_LIBRARIES,
      scenario: 'no media libraries found',
      setup: {mediaLibraries: []},
    },
    {
      additionalCheck: (error: Error) => expect(error.message).toContain('non-existent-library'),
      args: [TEST_OUTPUTS.TAR_GZ, '--media-library-id', 'non-existent-library'],
      errorMessage: ERROR_MESSAGES.MEDIA_LIBRARY_NOT_FOUND,
      scenario: 'media library ID not found',
      setup: {},
    },
  ])('should error when $scenario', async ({additionalCheck, args, errorMessage, setup}) => {
    const context = createTestContext(setup)

    // Add mockApi for scenarios that have a projectId
    if (context.projectId) {
      mockApi({
        apiVersion: MEDIA_LIBRARY_API_VERSION,
        query: {projectId: context.projectId},
        uri: '/media-libraries',
      }).reply(200, {
        data: context.mediaLibraries,
      })
    }

    const {error} = await testCommand(MediaExportCommand, args)

    expect(error?.message).toContain(errorMessage)
    expect(error?.oclif?.exit).toBe(1)
    if (additionalCheck) {
      additionalCheck(error as Error)
    }
  })

  test.each([
    {
      args: ['--asset-concurrency', '16'],
      description: 'custom asset concurrency',
      expected: {assetConcurrency: 16},
    },
    {
      args: ['--no-compress'],
      description: 'disabled compression',
      expected: {compress: false},
    },
  ])('should pass $description flag correctly', async ({args, expected}) => {
    createTestContext({selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID})

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    await testCommand(MediaExportCommand, [TEST_OUTPUTS.TAR_GZ, ...args])

    expect(mockExportDataset).toHaveBeenCalledWith(expect.objectContaining(expected))
  })

  test('should handle export failure', async () => {
    createTestContext({selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID})

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    mockExportDataset.mockRejectedValueOnce(new Error('Export operation failed'))

    const {error} = await testCommand(MediaExportCommand, [TEST_OUTPUTS.TAR_GZ])

    expect(error?.message).toContain(ERROR_MESSAGES.EXPORT_FAILED)
    expect(error?.message).toContain('Export operation failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should create subdirectories if they do not exist', async () => {
    createTestContext({selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID})

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    await testCommand(MediaExportCommand, [TEST_OUTPUTS.SUBDIR])

    expect(mockFs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('subdir'),
      expect.objectContaining({recursive: true}),
    )
  })

  test('should filter inactive media libraries', async () => {
    createTestContext({
      mediaLibraries: [
        {id: 'active-library', organizationId: 'org-1', status: 'active' as const},
        {id: 'inactive-library', organizationId: 'org-1', status: 'inactive' as const},
      ],
      selectValue: 'active-library',
    })

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'active-library', organizationId: 'org-1', status: 'active'},
        {id: 'inactive-library', organizationId: 'org-1', status: 'inactive'},
      ],
    })

    await testCommand(MediaExportCommand, [TEST_OUTPUTS.TAR_GZ])

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: expect.arrayContaining([expect.objectContaining({value: 'active-library'})]),
      }),
    )

    const selectCall = mockSelect.mock.calls[0][0]
    const choices = selectCall.choices.filter((choice: unknown) => typeof choice === 'object')
    expect(choices).not.toContainEqual(expect.objectContaining({value: 'inactive-library'}))
  })
})
