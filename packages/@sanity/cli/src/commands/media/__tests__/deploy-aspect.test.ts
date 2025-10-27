import {select} from '@inquirer/prompts'
import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import {type MediaLibraryAssetAspectDocument} from '@sanity/types'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import * as importAspectsModule from '../../../actions/media/importAspects.js'
import {MEDIA_LIBRARY_API_VERSION} from '../../../services/mediaLibraries.js'
import {NO_MEDIA_LIBRARY_ASPECTS_PATH, NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {MediaDeployAspectCommand} from '../deploy-aspect.js'

vi.mock('@inquirer/prompts', async () => {
  const actual = await vi.importActual<typeof import('@inquirer/prompts')>('@inquirer/prompts')
  return {
    ...actual,
    select: vi.fn(),
  }
})

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/project',
    root: '/test/project',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      projectId: 'test-project-id',
    },
    mediaLibrary: {
      aspectsPath: '/test/project/aspects',
    },
  }),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../actions/media/importAspects.js', () => ({
  importAspects: vi.fn(),
}))

const mockSelect = vi.mocked(select)
const mockGetCliConfig = vi.mocked(getCliConfig)
const mockImportAspects = vi.mocked(importAspectsModule.importAspects)

describe('#media:deploy-aspect', () => {
  afterEach(() => {
    vi.clearAllMocks()
    // Reset getCliConfig mock to default
    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project-id',
      },
      mediaLibrary: {
        aspectsPath: '/test/project/aspects',
      },
    })
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
        ASPECTNAME  Name of the aspect to deploy

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
    const {error} = await testCommand(MediaDeployAspectCommand, args)

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
    mockGetCliConfig.mockResolvedValue(config)

    const {error} = await testCommand(MediaDeployAspectCommand, ['myAspect'])

    expect(error?.message).toContain(expectedError)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should successfully deploy a single aspect', async () => {
    // Mock the media libraries API call
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {
          id: 'test-library-id',
          organizationId: 'test-org-id',
          status: 'active',
        },
      ],
    })

    mockSelect.mockResolvedValue('test-library-id')

    // Mock importAspects
    mockImportAspects.mockResolvedValue({
      invalid: [],
      valid: [
        {
          aspect: {
            _id: 'myAspect',
            _type: 'sanity.mediaLibrary.assetAspect',
            definition: {},
          } as unknown as MediaLibraryAssetAspectDocument,
          filename: 'myAspect.ts',
          status: 'valid',
          validationErrors: [],
        },
      ],
    })

    // Mock deploy API call
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(200, {
      results: [{id: 'myAspect', operation: 'created'}],
    })

    const {stdout} = await testCommand(MediaDeployAspectCommand, ['myAspect'])

    expect(mockImportAspects).toHaveBeenCalledWith({
      aspectsPath: '/test/project/aspects',
      filterAspects: expect.any(Function),
    })
    expect(stdout).toContain('✓')
    expect(stdout).toContain('Deployed 1 aspect')
    expect(stdout).toContain('myAspect')
  })

  test('should deploy all aspects with --all flag', async () => {
    // Mock the media libraries API call
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {
          id: 'test-library-id',
          organizationId: 'test-org-id',
          status: 'active',
        },
      ],
    })

    mockSelect.mockResolvedValue('test-library-id')

    // Mock importAspects with multiple aspects
    mockImportAspects.mockResolvedValue({
      invalid: [],
      valid: [
        {
          aspect: {
            _id: 'aspect1',
            _type: 'sanity.mediaLibrary.assetAspect',
            definition: {},
          } as unknown as MediaLibraryAssetAspectDocument,
          filename: 'aspect1.ts',
          status: 'valid',
          validationErrors: [],
        },
        {
          aspect: {
            _id: 'aspect2',
            _type: 'sanity.mediaLibrary.assetAspect',
            definition: {},
          } as unknown as MediaLibraryAssetAspectDocument,
          filename: 'aspect2.ts',
          status: 'valid',
          validationErrors: [],
        },
      ],
    })

    // Mock deploy API call
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

    const {stdout} = await testCommand(MediaDeployAspectCommand, ['--all'])

    expect(stdout).toContain('✓')
    expect(stdout).toContain('Deployed 2 aspects')
    expect(stdout).toContain('aspect1')
    expect(stdout).toContain('aspect2')
  })

  test('should use --media-library-id flag when provided', async () => {
    // Mock importAspects
    mockImportAspects.mockResolvedValue({
      invalid: [],
      valid: [
        {
          aspect: {
            _id: 'myAspect',
            _type: 'sanity.mediaLibrary.assetAspect',
            definition: {},
          } as unknown as MediaLibraryAssetAspectDocument,
          filename: 'myAspect.ts',
          status: 'valid',
          validationErrors: [],
        },
      ],
    })

    // Mock deploy API call
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/custom-library-id/mutate',
    }).reply(200, {
      results: [{id: 'myAspect', operation: 'created'}],
    })

    await testCommand(MediaDeployAspectCommand, [
      'myAspect',
      '--media-library-id',
      'custom-library-id',
    ])

    expect(mockSelect).not.toHaveBeenCalled()
  })

  test('should error if aspect is not found', async () => {
    // Mock the media libraries API call
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {
          id: 'test-library-id',
          organizationId: 'test-org-id',
          status: 'active',
        },
      ],
    })

    mockSelect.mockResolvedValue('test-library-id')

    // Mock importAspects with no results
    mockImportAspects.mockResolvedValue({
      invalid: [],
      valid: [],
    })

    const {error} = await testCommand(MediaDeployAspectCommand, ['nonExistentAspect'])

    expect(error?.message).toContain('Could not find aspect')
    expect(error?.message).toContain('nonExistentAspect')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should skip invalid aspects and deploy only valid ones', async () => {
    // Mock the media libraries API call
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {
          id: 'test-library-id',
          organizationId: 'test-org-id',
          status: 'active',
        },
      ],
    })

    mockSelect.mockResolvedValue('test-library-id')

    // Mock importAspects with both valid and invalid aspects
    mockImportAspects.mockResolvedValue({
      invalid: [
        {
          aspect: {_id: 'invalidAspect'},
          filename: 'invalidAspect.ts',
          status: 'invalid',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          validationErrors: [[{message: 'Missing required field'} as any]],
        },
      ],
      valid: [
        {
          aspect: {
            _id: 'validAspect',
            _type: 'sanity.mediaLibrary.assetAspect',
            definition: {},
          } as unknown as MediaLibraryAssetAspectDocument,
          filename: 'validAspect.ts',
          status: 'valid',
          validationErrors: [],
        },
      ],
    })

    // Mock deploy API call
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(200, {
      results: [{id: 'validAspect', operation: 'created'}],
    })

    const {stderr, stdout} = await testCommand(MediaDeployAspectCommand, ['--all'])

    expect(stderr).toContain('Skipped 1 invalid aspect')
    expect(stderr).toContain('invalidAspect')
    expect(stdout).toContain('Deployed 1 aspect')
    expect(stdout).toContain('validAspect')
  })

  test('should warn if no valid aspects to deploy', async () => {
    // Mock the media libraries API call
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {
          id: 'test-library-id',
          organizationId: 'test-org-id',
          status: 'active',
        },
      ],
    })

    mockSelect.mockResolvedValue('test-library-id')

    // Mock importAspects with only invalid aspects
    mockImportAspects.mockResolvedValue({
      invalid: [
        {
          aspect: {_id: 'invalidAspect'},
          filename: 'invalidAspect.ts',
          status: 'invalid',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          validationErrors: [[{message: 'Invalid aspect structure'} as any]],
        },
      ],
      valid: [],
    })

    const {stderr} = await testCommand(MediaDeployAspectCommand, ['--all'])

    expect(stderr).toContain('Skipped 1 invalid aspect')
    expect(stderr).toContain('No valid aspects to deploy')
  })

  test('should handle API errors gracefully', async () => {
    // Mock the media libraries API call
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'get',
      query: {projectId: 'test-project-id'},
      uri: '/media-libraries',
    }).reply(200, {
      data: [
        {
          id: 'test-library-id',
          organizationId: 'test-org-id',
          status: 'active',
        },
      ],
    })

    mockSelect.mockResolvedValue('test-library-id')

    // Mock importAspects
    mockImportAspects.mockResolvedValue({
      invalid: [],
      valid: [
        {
          aspect: {
            _id: 'myAspect',
            _type: 'sanity.mediaLibrary.assetAspect',
            definition: {},
          } as unknown as MediaLibraryAssetAspectDocument,
          filename: 'myAspect.ts',
          status: 'valid',
          validationErrors: [],
        },
      ],
    })

    // Mock deploy API call to fail
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(500, {message: 'Internal server error'})

    const {error} = await testCommand(MediaDeployAspectCommand, ['myAspect'])

    expect(error?.message).toContain('Failed to deploy aspects')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fetch and present media libraries for selection', async () => {
    // Mock the media libraries API call
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

    mockSelect.mockResolvedValue('selected-library-id')

    // Mock importAspects
    mockImportAspects.mockResolvedValue({
      invalid: [],
      valid: [
        {
          aspect: {
            _id: 'myAspect',
            _type: 'sanity.mediaLibrary.assetAspect',
            definition: {},
          } as unknown as MediaLibraryAssetAspectDocument,
          filename: 'myAspect.ts',
          status: 'valid',
          validationErrors: [],
        },
      ],
    })

    // Mock deploy API call
    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/selected-library-id/mutate',
    }).reply(200, {
      results: [{id: 'myAspect', operation: 'created'}],
    })

    await testCommand(MediaDeployAspectCommand, ['myAspect'])

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select media library',
      }),
    )
  })
})
