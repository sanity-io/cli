import {basename} from 'node:path'

import {runCommand} from '@oclif/test'
import {select} from '@sanity/cli-core/ux'
import {convertToSystemPath, createTestToken, mockApi, testCommand} from '@sanity/cli-test'
import {
  MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME,
  type MediaLibraryAssetAspectDocument,
} from '@sanity/types'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {MEDIA_LIBRARY_API_VERSION} from '../../../services/mediaLibraries.js'
import {NO_MEDIA_LIBRARY_ASPECTS_PATH, NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {MediaDeployAspectCommand} from '../deploy-aspect.js'

const mockFsAccess = vi.hoisted(() => vi.fn())
const mockFsReaddir = vi.hoisted(() => vi.fn())
const mockTsImport = vi.hoisted(() => vi.fn())
const mockGetTsconfig = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({
  access: mockFsAccess,
  readdir: mockFsReaddir,
}))

vi.mock('tsx/esm/api', () => ({
  tsImport: mockTsImport,
}))

vi.mock('get-tsconfig', () => ({
  getTsconfig: mockGetTsconfig,
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    select: vi.fn(),
  }
})

const mockSelect = vi.mocked(select)

const defaultMocks = {
  cliConfig: {
    api: {
      projectId: 'test-project-id',
    },
    mediaLibrary: {
      aspectsPath: convertToSystemPath('/test/project/aspects'),
    },
  },
  projectRoot: {
    directory: convertToSystemPath('/test/project'),
    path: convertToSystemPath('/test/project/sanity.config.ts'),
    root: convertToSystemPath('/test/project'),
    type: 'studio' as const,
  },
  token: 'test-token',
}

/**
 * Helper to create a mock aspect definition with valid schema
 */
function createMockAspect(id: string): MediaLibraryAssetAspectDocument {
  return {
    _createdAt: new Date().toISOString(),
    _id: id,
    _rev: 'mock-revision',
    _type: MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME,
    _updatedAt: new Date().toISOString(),
    definition: {
      fields: [
        {
          name: 'testField',
          title: 'Test Field',
          type: 'string',
        },
      ],
      name: id,
      title: id,
      type: 'object',
    },
  } as MediaLibraryAssetAspectDocument
}

/**
 * Helper to create an invalid aspect definition
 * Uses unsupported field types (image/file) which are not allowed in aspects
 */
function createInvalidMockAspect(id: string): MediaLibraryAssetAspectDocument {
  return {
    _createdAt: new Date().toISOString(),
    _id: id,
    _rev: 'mock-revision',
    _type: MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME,
    _updatedAt: new Date().toISOString(),
    definition: {
      fields: [
        {
          name: 'invalidImageField',
          title: 'Invalid Image Field',
          type: 'image', // Image type is not allowed in aspects
        },
      ],
      name: id,
      title: id,
      type: 'object',
    },
  } as MediaLibraryAssetAspectDocument
}

/**
 * Helper to setup filesystem mocks for aspect files
 */
function setupFileSystemMock(files: Array<{filename: string; isFile: boolean}>) {
  mockFsAccess.mockResolvedValue(undefined)
  mockFsReaddir.mockResolvedValue(
    files.map((file) => ({
      isFile: () => file.isFile,
      name: file.filename,
    })),
  )
}

/**
 * Helper to setup tsImport mock to return aspect definitions
 */
function setupTsImportMock(
  imports: Record<
    string,
    {
      aspect: unknown
      errorMessage?: string
      shouldFail?: boolean
    }
  >,
) {
  mockTsImport.mockImplementation(async (filePath: string) => {
    const filename = basename(filePath)
    const importConfig = imports[filename]

    if (!importConfig) {
      throw new Error(`No mock configured for ${filename}`)
    }

    if (importConfig.shouldFail) {
      throw new Error(importConfig.errorMessage || 'Import failed')
    }

    return {
      default: importConfig.aspect,
    }
  })
}

/**
 * Setup default mocks for a successful test scenario
 */
function setupDefaultMocks() {
  mockFsAccess.mockResolvedValue(undefined)
  mockFsReaddir.mockResolvedValue([])
  mockGetTsconfig.mockReturnValue({path: '/test/tsconfig.json'} as never)
}

describe('#media:deploy-aspect', () => {
  beforeEach(() => {
    setupDefaultMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('should show help text correctly', async () => {
    const {stdout} = await runCommand(['media deploy-aspect --help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Deploy an aspect

      USAGE
        $ sanity media deploy-aspect [ASPECTNAME] [--all] [--media-library-id <value>]

      ARGUMENTS
        [ASPECTNAME]  Name of the aspect to deploy

      FLAGS
        --all                       Deploy all aspects
        --media-library-id=<value>  The id of the target media library

      DESCRIPTION
        Deploy an aspect

      EXAMPLES
        Deploy the aspect named "someAspect"

          $ sanity media deploy-aspect someAspect

        Deploy all aspects

          $ sanity media deploy-aspect --all

      "
    `)
  })

  test.each([
    {
      args: [],
      description: 'neither aspect name nor --all flag is provided',
      expectedError:
        'Specify an aspect name, or use the `--all` option to deploy all aspect definitions.',
    },
    {
      args: ['myAspect', '--all'],
      description: 'both aspect name and --all flag are provided',
      expectedError: 'Specified both an aspect name and `--all`.',
    },
  ])('should error if $description', async ({args, expectedError}) => {
    const {error} = await testCommand(MediaDeployAspectCommand, args, {mocks: defaultMocks})

    expect(error?.message).toContain(expectedError)
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    {
      config: {
        mediaLibrary: {
          aspectsPath: '/test/project/aspects',
        },
      },
      description: 'project ID is not configured',
      expectedError: NO_PROJECT_ID,
    },
    {
      config: {
        api: {
          projectId: 'test-project-id',
        },
      },
      description: 'media library aspects path is not configured',
      expectedError: NO_MEDIA_LIBRARY_ASPECTS_PATH,
    },
  ])('should error if $description', async ({config, expectedError}) => {
    const {error} = await testCommand(MediaDeployAspectCommand, ['myAspect'], {
      mocks: {
        ...defaultMocks,
        cliConfig: config,
      },
    })

    expect(error?.message).toContain(expectedError)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should successfully deploy a single aspect', async () => {
    setupFileSystemMock([{filename: 'myAspect.ts', isFile: true}])

    setupTsImportMock({
      'myAspect.ts': {
        aspect: createMockAspect('myAspect'),
      },
    })

    createTestToken('test-token')
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [{id: 'test-library-id', organizationId: 'test-org-id', status: 'active'}],
    })

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(200, {
      results: [{id: 'myAspect', operation: 'created'}],
    })

    mockSelect.mockResolvedValue('test-library-id')

    const {stdout} = await testCommand(MediaDeployAspectCommand, ['myAspect'], {
      mocks: defaultMocks,
    })

    expect(mockFsReaddir).toHaveBeenCalledWith(convertToSystemPath('/test/project/aspects'), {
      withFileTypes: true,
    })
    expect(mockTsImport).toHaveBeenCalled()
    expect(stdout).toContain('✓')
    expect(stdout).toContain('Deployed 1 aspect')
    expect(stdout).toContain('myAspect')
  })

  test('should deploy all aspects with --all flag', async () => {
    setupFileSystemMock([
      {filename: 'aspect1.ts', isFile: true},
      {filename: 'aspect2.ts', isFile: true},
    ])

    setupTsImportMock({
      'aspect1.ts': {
        aspect: createMockAspect('aspect1'),
      },
      'aspect2.ts': {
        aspect: createMockAspect('aspect2'),
      },
    })

    createTestToken('test-token')
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [{id: 'test-library-id', organizationId: 'test-org-id', status: 'active'}],
    })

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(200, {
      results: [
        {id: 'aspect1', operation: 'created'},
        {id: 'aspect2', operation: 'created'},
      ],
    })

    mockSelect.mockResolvedValue('test-library-id')

    const {stdout} = await testCommand(MediaDeployAspectCommand, ['--all'], {mocks: defaultMocks})

    expect(stdout).toContain('✓')
    expect(stdout).toContain('Deployed 2 aspects')
    expect(stdout).toContain('aspect1')
    expect(stdout).toContain('aspect2')
  })

  test('should use --media-library-id flag when provided', async () => {
    setupFileSystemMock([{filename: 'myAspect.ts', isFile: true}])

    setupTsImportMock({
      'myAspect.ts': {
        aspect: createMockAspect('myAspect'),
      },
    })

    createTestToken('test-token')
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/custom-library-id/mutate',
    }).reply(200, {
      results: [{id: 'myAspect', operation: 'created'}],
    })

    await testCommand(
      MediaDeployAspectCommand,
      ['myAspect', '--media-library-id', 'custom-library-id'],
      {mocks: defaultMocks},
    )

    expect(mockSelect).not.toHaveBeenCalled()
  })

  test('should error if aspect is not found', async () => {
    setupFileSystemMock([
      {filename: 'someOtherAspect.ts', isFile: true},
      {filename: 'anotherAspect.ts', isFile: true},
    ])

    setupTsImportMock({
      'anotherAspect.ts': {
        aspect: createMockAspect('anotherAspect'),
      },
      'someOtherAspect.ts': {
        aspect: createMockAspect('someOtherAspect'),
      },
    })

    createTestToken('test-token')
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [{id: 'test-library-id', organizationId: 'test-org-id', status: 'active'}],
    })

    mockSelect.mockResolvedValue('test-library-id')

    const {error} = await testCommand(MediaDeployAspectCommand, ['nonExistentAspect'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Could not find aspect')
    expect(error?.message).toContain('nonExistentAspect')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should skip invalid aspects and deploy only valid ones', async () => {
    setupFileSystemMock([
      {filename: 'invalidAspect.ts', isFile: true},
      {filename: 'validAspect.ts', isFile: true},
    ])

    setupTsImportMock({
      'invalidAspect.ts': {
        aspect: createInvalidMockAspect('invalidAspect'),
      },
      'validAspect.ts': {
        aspect: createMockAspect('validAspect'),
      },
    })

    createTestToken('test-token')
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [{id: 'test-library-id', organizationId: 'test-org-id', status: 'active'}],
    })

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(200, {
      results: [{id: 'validAspect', operation: 'created'}],
    })

    mockSelect.mockResolvedValue('test-library-id')

    const {stderr, stdout} = await testCommand(MediaDeployAspectCommand, ['--all'], {
      mocks: defaultMocks,
    })

    expect(stderr).toContain('Skipped 1 invalid aspect')
    expect(stderr).toContain('invalidAspect')
    expect(stdout).toContain('Deployed 1 aspect')
    expect(stdout).toContain('validAspect')
  })

  test('should warn if no valid aspects to deploy', async () => {
    setupFileSystemMock([{filename: 'invalidAspect.ts', isFile: true}])

    setupTsImportMock({
      'invalidAspect.ts': {
        aspect: createInvalidMockAspect('invalidAspect'),
      },
    })

    createTestToken('test-token')
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [{id: 'test-library-id', organizationId: 'test-org-id', status: 'active'}],
    })

    mockSelect.mockResolvedValue('test-library-id')

    const {stderr} = await testCommand(MediaDeployAspectCommand, ['--all'], {mocks: defaultMocks})

    expect(stderr).toContain('Skipped 1 invalid aspect')
    expect(stderr).toContain('No valid aspects to deploy')
  })

  test('should handle API errors gracefully', async () => {
    setupFileSystemMock([{filename: 'myAspect.ts', isFile: true}])

    setupTsImportMock({
      'myAspect.ts': {
        aspect: createMockAspect('myAspect'),
      },
    })

    createTestToken('test-token')
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [{id: 'test-library-id', organizationId: 'test-org-id', status: 'active'}],
    })

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(500, {
      error: 'Internal server error',
    })

    mockSelect.mockResolvedValue('test-library-id')

    const {error} = await testCommand(MediaDeployAspectCommand, ['myAspect'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to deploy aspects')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fetch and present media libraries for selection', async () => {
    setupFileSystemMock([{filename: 'myAspect.ts', isFile: true}])

    setupTsImportMock({
      'myAspect.ts': {
        aspect: createMockAspect('myAspect'),
      },
    })

    createTestToken('test-token')
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {
          id: 'selected-library-id',
          organizationId: 'test-org-id',
          status: 'active',
        },
      ],
    })

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/selected-library-id/mutate',
    }).reply(200, {
      results: [{id: 'myAspect', operation: 'created'}],
    })

    mockSelect.mockResolvedValue('selected-library-id')

    await testCommand(MediaDeployAspectCommand, ['myAspect'], {mocks: defaultMocks})

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select media library',
      }),
    )
  })
})
