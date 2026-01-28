import {runCommand} from '@oclif/test'
import {confirm, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MEDIA_LIBRARY_API_VERSION} from '../../../services/mediaLibraries.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {MediaDeleteAspectCommand} from '../delete-aspect.js'

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: vi.fn(),
    select: vi.fn(),
  }
})

const mockConfirm = vi.mocked(confirm)
const mockSelect = vi.mocked(select)

const defaultMocks = {
  cliConfig: {
    api: {
      projectId: 'test-project-id',
    },
  },
  projectRoot: {
    directory: '/test/project',
    path: '/test/project/sanity.config.ts',
    root: '/test/project',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#media:delete-aspect', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('should show help text correctly', async () => {
    const {stdout} = await runCommand(['media', 'delete-aspect', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Undeploy an aspect

      USAGE
        $ sanity media delete-aspect ASPECTNAME [--media-library-id <value>] [--yes]

      ARGUMENTS
        ASPECTNAME  Name of the aspect to delete

      FLAGS
        --media-library-id=<value>  The id of the target media library
        --yes                       Skip confirmation prompt

      DESCRIPTION
        Undeploy an aspect

      EXAMPLES
        Delete the aspect named "someAspect"

          $ sanity media delete-aspect someAspect

      "
    `)
  })

  test('should error if aspect name is not provided', async () => {
    const {error} = await testCommand(MediaDeleteAspectCommand, [], {mocks: defaultMocks})

    expect(error?.message).toMatchInlineSnapshot(`
      "Missing 1 required arg:
      aspectName  Name of the aspect to delete
      See more help with --help"
    `)
    expect(error?.oclif?.exit).toBe(2)
  })

  test('should error if project ID is not configured', async () => {
    const {error} = await testCommand(MediaDeleteAspectCommand, ['myAspect'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {},
      },
    })

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should successfully delete an aspect with confirmation', async () => {
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
    mockConfirm.mockResolvedValue(true)

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(200, {results: [{id: 'myAspect'}]})

    const {stdout} = await testCommand(MediaDeleteAspectCommand, ['myAspect'], {
      mocks: defaultMocks,
    })

    expect(mockConfirm).toHaveBeenCalledWith({
      default: false,
      message: expect.stringContaining('Are you absolutely sure'),
    })
    expect(stdout).toContain('✓')
    expect(stdout).toContain('Deleted aspect')
    expect(stdout).toContain('myAspect')
  })

  test('should skip confirmation with --yes flag', async () => {
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

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(200, {results: [{id: 'myAspect'}]})

    await testCommand(MediaDeleteAspectCommand, ['myAspect', '--yes'], {mocks: defaultMocks})

    expect(mockConfirm).not.toHaveBeenCalled()
  })

  test('should cancel operation if user declines confirmation', async () => {
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
    mockConfirm.mockResolvedValue(false)

    const {stdout} = await testCommand(MediaDeleteAspectCommand, ['myAspect'], {
      mocks: defaultMocks,
    })

    expect(mockConfirm).toHaveBeenCalled()
    expect(stdout).toContain('Operation cancelled')
  })

  test('should use --media-library-id flag when provided', async () => {
    mockConfirm.mockResolvedValue(true)

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/custom-library-id/mutate',
    }).reply(200, {results: [{id: 'myAspect'}]})

    await testCommand(
      MediaDeleteAspectCommand,
      ['myAspect', '--media-library-id', 'custom-library-id', '--yes'],
      {mocks: defaultMocks},
    )

    expect(mockSelect).not.toHaveBeenCalled()
  })

  test('should warn if aspect does not exist', async () => {
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
    mockConfirm.mockResolvedValue(true)

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(200, {results: []})

    const {stderr, stdout} = await testCommand(
      MediaDeleteAspectCommand,
      ['nonExistentAspect', '--yes'],
      {mocks: defaultMocks},
    )

    expect(stderr).toContain("There's no deployed aspect with that name")
    expect(stdout).toContain('nonExistentAspect')
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
    mockConfirm.mockResolvedValue(true)

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/test-library-id/mutate',
    }).reply(500, {message: 'Network timeout'})

    const {error} = await testCommand(MediaDeleteAspectCommand, ['myAspect', '--yes'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to delete aspect')
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
    mockConfirm.mockResolvedValue(true)

    mockApi({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      method: 'post',
      uri: '/media-libraries/selected-library-id/mutate',
    }).reply(200, {results: [{id: 'myAspect'}]})

    await testCommand(MediaDeleteAspectCommand, ['myAspect', '--yes'], {mocks: defaultMocks})

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select media library',
      }),
    )
  })
})
