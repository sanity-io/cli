import fs from 'node:fs/promises'

import {type CliConfig} from '@sanity/cli-core'
import {input, select} from '@sanity/cli-core/ux'
import {createTestToken, mockApi, testCommand} from '@sanity/cli-test'
import {exportDataset} from '@sanity/export'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MEDIA_LIBRARY_API_VERSION} from '../../../services/mediaLibraries.js'
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

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn(),
  },
}))

const mockExportDataset = vi.mocked(exportDataset)
const mockInput = vi.mocked(input)
const mockSelect = vi.mocked(select)
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

const defaultMocks = {
  cliConfig: {
    api: {projectId: TEST_CONFIG.PROJECT_ID} as CliConfig['api'],
  },
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    root: '/test/path',
    type: 'studio' as const,
  },
  token: 'test-token',
}

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

  // Setup fs.stat mock
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

  // Return context with mocks for testCommand
  return {
    ...context,
    mocks: {
      ...defaultMocks,
      cliConfig: {
        api: {projectId: context.projectId} as CliConfig['api'],
      },
    },
  }
}

describe('#media:export', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('should export with provided destination', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: TEST_CONFIG.MEDIA_LIBRARY_ID, organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    createTestToken('test-token')
    mockSelect.mockResolvedValue(TEST_CONFIG.MEDIA_LIBRARY_ID)
    const ctx = createTestContext()

    const {stderr, stdout} = await testCommand(MediaExportCommand, [TEST_OUTPUTS.TAR_GZ], {
      mocks: ctx.mocks,
    })

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
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    createTestToken('test-token')
    const ctx = createTestContext()

    const {stderr, stdout} = await testCommand(
      MediaExportCommand,
      [TEST_OUTPUTS.TAR_GZ, '--media-library-id', TEST_CONFIG.MEDIA_LIBRARY_ID],
      {mocks: ctx.mocks},
    )

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
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    createTestToken('test-token')
    const ctx = createTestContext({selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID})

    await testCommand(MediaExportCommand, [TEST_OUTPUTS.TAR_GZ], {mocks: ctx.mocks})

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select media library:',
      }),
    )
  })

  test('should prompt for destination when not provided', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    createTestToken('test-token')
    const ctx = createTestContext({
      inputValue: TEST_OUTPUTS.TAR_GZ,
      selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID,
    })

    await testCommand(MediaExportCommand, [], {mocks: ctx.mocks})

    expect(mockInput).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Output path:',
      }),
    )
  })

  test('should error when file already exists without overwrite flag', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    createTestToken('test-token')
    const ctx = createTestContext({
      fileExists: true,
      selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID,
    })

    const {error} = await testCommand(MediaExportCommand, [TEST_OUTPUTS.EXISTING], {
      mocks: ctx.mocks,
    })

    expect(error?.message).toContain(ERROR_MESSAGES.ALREADY_EXISTS)
    expect(error?.message).toContain(ERROR_MESSAGES.USE_OVERWRITE)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should overwrite file when overwrite flag is provided', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    createTestToken('test-token')
    const ctx = createTestContext({
      fileExists: true,
      selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID,
    })

    const {stderr, stdout} = await testCommand(
      MediaExportCommand,
      [TEST_OUTPUTS.EXISTING, '--overwrite'],
      {mocks: ctx.mocks},
    )

    expect(stderr).toBe('')
    expect(stdout).toContain('Export finished')
  })

  test('should use directory and append default filename', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    createTestToken('test-token')
    const ctx = createTestContext({
      fileExists: true,
      isFile: false,
      selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID,
    })

    await testCommand(MediaExportCommand, ['some-directory'], {mocks: ctx.mocks})

    expect(mockExportDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        outputPath: expect.stringContaining(`${TEST_CONFIG.MEDIA_LIBRARY_ID}-export.tar.gz`),
      }),
    )
  })

  test('should export to stdout when destination is -', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    createTestToken('test-token')
    const ctx = createTestContext({selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID})

    await testCommand(MediaExportCommand, [TEST_OUTPUTS.STDOUT], {mocks: ctx.mocks})

    expect(mockExportDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        outputPath: process.stdout,
      }),
    )
  })

  test.each([
    {
      args: [TEST_OUTPUTS.TAR_GZ],
      errorMessage: 'Unable to determine project ID',
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
    const ctx = createTestContext(setup)

    // Set up mock for API calls (skip if no projectId)
    if (ctx.projectId) {
      createTestToken('test-token')
      const data = ctx.mediaLibraries.filter((lib) => lib.status === 'active')
      mockApi({
        apiVersion: MEDIA_LIBRARY_API_VERSION,
        method: 'get',
        query: {projectId: ctx.projectId},
        uri: '/media-libraries',
      }).reply(200, {data})
    }

    const {error} = await testCommand(MediaExportCommand, args, {mocks: ctx.mocks})

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
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    createTestToken('test-token')
    const ctx = createTestContext({selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID})

    await testCommand(MediaExportCommand, [TEST_OUTPUTS.TAR_GZ, ...args], {mocks: ctx.mocks})

    expect(mockExportDataset).toHaveBeenCalledWith(expect.objectContaining(expected))
  })

  test('should handle export failure', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    createTestToken('test-token')
    const ctx = createTestContext({selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID})
    mockExportDataset.mockRejectedValueOnce(new Error('Export operation failed'))

    const {error} = await testCommand(MediaExportCommand, [TEST_OUTPUTS.TAR_GZ], {
      mocks: ctx.mocks,
    })

    expect(error?.message).toContain(ERROR_MESSAGES.EXPORT_FAILED)
    expect(error?.message).toContain('Export operation failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should create subdirectories if they do not exist', async () => {
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'test-media-library', organizationId: 'org-1', status: 'active'},
        {id: 'another-library', organizationId: 'org-1', status: 'active'},
      ],
    })

    createTestToken('test-token')
    const ctx = createTestContext({selectValue: TEST_CONFIG.MEDIA_LIBRARY_ID})

    await testCommand(MediaExportCommand, [TEST_OUTPUTS.SUBDIR], {mocks: ctx.mocks})

    expect(mockFs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('subdir'),
      expect.objectContaining({recursive: true}),
    )
  })

  test('should filter inactive media libraries', async () => {
    // Set up custom mock for this test with both active and inactive libraries
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: TEST_CONFIG.PROJECT_ID},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {id: 'active-library', organizationId: 'org-1', status: 'active'},
        {id: 'inactive-library', organizationId: 'org-1', status: 'inactive'},
      ],
    })

    createTestToken('test-token')
    const ctx = createTestContext({
      mediaLibraries: [
        {id: 'active-library', organizationId: 'org-1', status: 'active' as const},
        {id: 'inactive-library', organizationId: 'org-1', status: 'inactive' as const},
      ],
      selectValue: 'active-library',
    })

    await testCommand(MediaExportCommand, [TEST_OUTPUTS.TAR_GZ], {mocks: ctx.mocks})

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
