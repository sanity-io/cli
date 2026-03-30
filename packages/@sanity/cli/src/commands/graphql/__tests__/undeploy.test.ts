import {ProjectRootNotFoundError} from '@sanity/cli-core'
import {convertToSystemPath, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getGraphQLAPIs} from '../../../actions/graphql/getGraphQLAPIs.js'
import {GRAPHQL_API_VERSION} from '../../../services/graphql.js'
import {Undeploy} from '../undeploy.js'

// Mock getGraphQLAPIs
vi.mock('../../../actions/graphql/getGraphQLAPIs.js', () => ({
  getGraphQLAPIs: vi.fn(),
}))

const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {dataset: 'production', projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockGetGraphQLAPIs = vi.mocked(getGraphQLAPIs)
const mockConfirm = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: mockConfirm,
  }
})

describe('graphql undeploy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('successfully undeploys GraphQL API with default tag', async () => {
    mockConfirm.mockResolvedValueOnce(true)

    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      projectId: 'test-project',
      uri: '/apis/graphql/production/default',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, [], {mocks: defaultMocks})

    expect(mockConfirm).toHaveBeenCalledWith({
      default: false,
      message:
        'Are you absolutely sure you want to delete the current GraphQL API connected to the "production" dataset in project test-project?',
    })
    expect(stdout).toBe('GraphQL API deleted\n')
  })

  test('successfully undeploys GraphQL API with custom tag', async () => {
    mockConfirm.mockResolvedValueOnce(true)

    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      projectId: 'test-project',
      uri: '/apis/graphql/production/beta',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, ['--tag', 'beta'], {mocks: defaultMocks})

    expect(mockConfirm).toHaveBeenCalledWith({
      default: false,
      message:
        'Are you absolutely sure you want to delete the GraphQL API connected to the "production" dataset in project test-project, tagged "beta"?',
    })
    expect(stdout).toBe('GraphQL API deleted\n')
  })

  test('successfully undeploys with --dataset flag', async () => {
    mockConfirm.mockResolvedValueOnce(true)

    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      projectId: 'test-project',
      uri: '/apis/graphql/staging/default',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, ['--dataset', 'staging'], {mocks: defaultMocks})

    expect(stdout).toBe('GraphQL API deleted\n')
  })

  test('uses --project flag when specified', async () => {
    mockConfirm.mockResolvedValueOnce(true)

    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      projectId: 'custom-project',
      uri: '/apis/graphql/production/default',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, ['--project', 'custom-project', '--force'], {
      mocks: defaultMocks,
    })

    expect(stdout).toBe('GraphQL API deleted\n')
  })

  test('successfully undeploys with all flags combined', async () => {
    mockConfirm.mockResolvedValue(true)

    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      projectId: 'custom-project',
      uri: '/apis/graphql/staging/experimental',
    }).reply(204)

    const {stdout} = await testCommand(
      Undeploy,
      ['--project', 'custom-project', '--dataset', 'staging', '--tag', 'experimental'],
      {mocks: defaultMocks},
    )

    expect(stdout).toBe('GraphQL API deleted\n')
    expect(mockConfirm).toHaveBeenCalledWith({
      default: false,
      message:
        'Are you absolutely sure you want to delete the GraphQL API connected to the "staging" dataset in project custom-project, tagged "experimental"?',
    })
  })

  test('successfully undeploys with --force flag (skips confirmation)', async () => {
    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      projectId: 'test-project',
      uri: '/apis/graphql/production/default',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, ['--force'], {mocks: defaultMocks})

    expect(stdout).toBe('GraphQL API deleted\n')
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  test('cancels deletion when user declines confirmation', async () => {
    mockConfirm.mockResolvedValue(false)
    const {stdout} = await testCommand(Undeploy, [], {mocks: defaultMocks})
    expect(stdout).toBe('Operation cancelled\n')
    expect(nock.pendingMocks()).toHaveLength(0) // No API call should be made
  })

  test('successfully undeploys with --api flag', async () => {
    mockConfirm.mockResolvedValue(true)

    mockGetGraphQLAPIs.mockResolvedValueOnce([
      {
        dataset: 'ios-dataset',
        id: 'ios',
        projectId: 'test-project',

        tag: 'mobile',
      },
    ])

    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      projectId: 'test-project',
      uri: '/apis/graphql/ios-dataset/mobile',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, ['--api', 'ios'], {mocks: defaultMocks})

    expect(stdout).toBe('GraphQL API deleted\n')
    expect(mockGetGraphQLAPIs).toHaveBeenCalledWith(convertToSystemPath('/test/path'))
  })

  test('throws error when --api flag references non-existent API', async () => {
    mockGetGraphQLAPIs.mockResolvedValueOnce([
      {
        dataset: 'production',
        id: 'web',
        projectId: 'test-project',

        tag: 'default',
      },
    ])

    const {error} = await testCommand(Undeploy, ['--api', 'ios'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('GraphQL API "ios" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('warns when both --api and --dataset are specified', async () => {
    mockConfirm.mockResolvedValue(true)

    mockGetGraphQLAPIs.mockResolvedValueOnce([
      {
        dataset: 'ios-dataset',
        id: 'ios',
        projectId: 'test-project',

        tag: 'default',
      },
    ])

    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      projectId: 'test-project',
      uri: '/apis/graphql/staging/default',
    }).reply(204)

    const {stderr, stdout} = await testCommand(Undeploy, ['--api', 'ios', '--dataset', 'staging'], {
      mocks: defaultMocks,
    })

    expect(stdout).toBe('GraphQL API deleted\n')
    expect(stderr).toContain('Both --api and --dataset specified, using --dataset staging')
  })

  test('errors when both --api and --project-id are specified', async () => {
    const {error} = await testCommand(Undeploy, ['--api', 'ios', '--project-id', 'test-project'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('cannot also be provided when using --api')
  })

  test('warns when both --api and --tag are specified', async () => {
    mockConfirm.mockResolvedValue(true)

    mockGetGraphQLAPIs.mockResolvedValueOnce([
      {
        dataset: 'production',
        id: 'ios',
        projectId: 'test-project',

        tag: 'mobile',
      },
    ])

    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      projectId: 'test-project',
      uri: '/apis/graphql/production/beta',
    }).reply(204)

    const {stderr, stdout} = await testCommand(Undeploy, ['--api', 'ios', '--tag', 'beta'], {
      mocks: defaultMocks,
    })

    expect(stdout).toBe('GraphQL API deleted\n')
    expect(stderr).toContain('Both --api and --tag specified, using --tag beta')
  })

  test('throws error when project ID is not defined', async () => {
    const {error} = await testCommand(Undeploy, ['--force'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {dataset: 'production', projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when dataset is not defined and not in config', async () => {
    const {error} = await testCommand(Undeploy, ['--force'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {dataset: undefined, projectId: testProjectId}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(
      'Dataset is required. Specify it with --dataset or configure it in your project.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API deletion error', async () => {
    mockConfirm.mockResolvedValue(true)

    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      projectId: 'test-project',
      uri: '/apis/graphql/production/default',
    }).reply(404, {message: 'GraphQL API not found'})

    const {error} = await testCommand(Undeploy, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('GraphQL API deletion failed')
    expect(error?.message).toContain('GraphQL API not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles user cancelling confirmation prompt', async () => {
    mockConfirm.mockRejectedValue(new Error('User cancelled'))

    const {error} = await testCommand(Undeploy, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe('Operation cancelled')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('propagates errors from getGraphQLAPIs when using --api flag', async () => {
    mockGetGraphQLAPIs.mockRejectedValueOnce(new Error('Config resolution failed'))

    const {error} = await testCommand(Undeploy, ['--api', 'ios'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe('Config resolution failed')
  })

  describe('outside project context', () => {
    const noProjectRootMocks = {
      cliConfigError: new ProjectRootNotFoundError('No project root found'),
      token: 'test-token',
    }

    test('works with --project-id and --dataset flags when no project root', async () => {
      mockConfirm.mockResolvedValueOnce(true)

      mockApi({
        apiVersion: GRAPHQL_API_VERSION,
        method: 'delete',
        projectId: 'flag-project',
        uri: '/apis/graphql/staging/default',
      }).reply(204)

      const {error, stdout} = await testCommand(
        Undeploy,
        ['--project-id', 'flag-project', '--dataset', 'staging'],
        {mocks: noProjectRootMocks},
      )

      if (error) throw error
      expect(stdout).toBe('GraphQL API deleted\n')
    })

    test('errors when no project root and no --project-id', async () => {
      const {error} = await testCommand(Undeploy, ['--dataset', 'staging', '--force'], {
        mocks: noProjectRootMocks,
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Unable to determine project ID')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('errors when no project root with --project-id but no --dataset', async () => {
      const {error} = await testCommand(Undeploy, ['--project-id', 'flag-project', '--force'], {
        mocks: noProjectRootMocks,
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Dataset is required')
      expect(error?.oclif?.exit).toBe(1)
    })
  })
})
