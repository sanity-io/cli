import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {createSchema} from 'sanity'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getGraphQLAPIs} from '../../../actions/graphql/getGraphQLAPIs.js'
import {GRAPHQL_API_VERSION} from '../../../services/graphql.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {Undeploy} from '../undeploy.js'

// Mock the config functions
vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      dataset: 'production',
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

// Mock getGraphQLAPIs
vi.mock('../../../actions/graphql/getGraphQLAPIs.js', () => ({
  getGraphQLAPIs: vi.fn(),
}))

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockGetGraphQLAPIs = vi.mocked(getGraphQLAPIs)
const mockConfirm = vi.hoisted(() => vi.fn())
const schema = createSchema({name: 'default', types: []})

// Mock inquirer prompts
vi.mock('@inquirer/prompts', () => ({
  confirm: mockConfirm,
}))

describe('graphql undeploy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset getCliConfig to default values for each test
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: 'test-project',
      },
    })
  })

  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['graphql undeploy', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Remove a deployed GraphQL API

      USAGE
        $ sanity graphql undeploy [--api <value>] [--dataset <value>] [--force]
          [--project <value>] [--tag <value>]

      FLAGS
        --api=<value>      Undeploy API with this ID (project, dataset and tag flags
                           take precedence)
        --dataset=<value>  Dataset to undeploy GraphQL API from
        --force            Skip confirmation prompt
        --project=<value>  Project ID to delete GraphQL API for
        --tag=<value>      [default: default] Tag to undeploy GraphQL API from

      DESCRIPTION
        Remove a deployed GraphQL API

      EXAMPLES
        Undeploy GraphQL API for current project and dataset

          $ sanity graphql undeploy

        Undeploy API with ID "ios"

          $ sanity graphql undeploy --api ios

        Undeploy GraphQL API for staging dataset

          $ sanity graphql undeploy --dataset staging

        Undeploy GraphQL API for staging dataset with "next" tag

          $ sanity graphql undeploy --dataset staging --tag next

        Undeploy GraphQL API without confirmation prompt

          $ sanity graphql undeploy --force

      "
    `)
  })

  test('successfully undeploys GraphQL API with default tag', async () => {
    mockConfirm.mockResolvedValueOnce(true)

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      uri: '/apis/graphql/production/default',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy)

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
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      uri: '/apis/graphql/production/beta',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, ['--tag', 'beta'])

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
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      uri: '/apis/graphql/staging/default',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, ['--dataset', 'staging'])

    expect(stdout).toBe('GraphQL API deleted\n')
  })

  test('uses --project flag when specified', async () => {
    mockConfirm.mockResolvedValueOnce(true)

    mockApi({
      apiHost: 'https://custom-project.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      uri: '/apis/graphql/production/default',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, ['--project', 'custom-project', '--force'])

    expect(stdout).toBe('GraphQL API deleted\n')
  })

  test('successfully undeploys with all flags combined', async () => {
    mockConfirm.mockResolvedValue(true)

    mockApi({
      apiHost: 'https://custom-project.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      uri: '/apis/graphql/staging/experimental',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, [
      '--project',
      'custom-project',
      '--dataset',
      'staging',
      '--tag',
      'experimental',
    ])

    expect(stdout).toBe('GraphQL API deleted\n')
    expect(mockConfirm).toHaveBeenCalledWith({
      default: false,
      message:
        'Are you absolutely sure you want to delete the GraphQL API connected to the "staging" dataset in project custom-project, tagged "experimental"?',
    })
  })

  test('successfully undeploys with --force flag (skips confirmation)', async () => {
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      uri: '/apis/graphql/production/default',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, ['--force'])

    expect(stdout).toBe('GraphQL API deleted\n')
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  test('cancels deletion when user declines confirmation', async () => {
    mockConfirm.mockResolvedValue(false)
    const {stdout} = await testCommand(Undeploy)
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
        schema,
        tag: 'mobile',
      },
    ])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      uri: '/apis/graphql/ios-dataset/mobile',
    }).reply(204)

    const {stdout} = await testCommand(Undeploy, ['--api', 'ios'])

    expect(stdout).toBe('GraphQL API deleted\n')
    expect(mockGetGraphQLAPIs).toHaveBeenCalledWith(process.cwd())
  })

  test('throws error when --api flag references non-existent API', async () => {
    mockGetGraphQLAPIs.mockResolvedValueOnce([
      {
        dataset: 'production',
        id: 'web',
        projectId: 'test-project',
        schema,
        tag: 'default',
      },
    ])

    const {error} = await testCommand(Undeploy, ['--api', 'ios'])

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
        schema,
        tag: 'default',
      },
    ])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      uri: '/apis/graphql/staging/default',
    }).reply(204)

    const {stderr, stdout} = await testCommand(Undeploy, ['--api', 'ios', '--dataset', 'staging'])

    expect(stdout).toBe('GraphQL API deleted\n')
    expect(stderr).toContain('Both --api and --dataset specified, using --dataset staging')
  })

  test('warns when both --api and --project are specified', async () => {
    mockConfirm.mockResolvedValue(true)

    mockGetGraphQLAPIs.mockResolvedValueOnce([
      {
        dataset: 'production',
        id: 'ios',
        projectId: 'ios-project',
        schema,
        tag: 'default',
      },
    ])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      uri: '/apis/graphql/production/default',
    }).reply(204)

    const {stderr, stdout} = await testCommand(Undeploy, [
      '--api',
      'ios',
      '--project',
      'test-project',
    ])

    expect(stdout).toBe('GraphQL API deleted\n')
    expect(stderr).toContain('Both --api and --project specified, using --project test-project')
  })

  test('warns when both --api and --tag are specified', async () => {
    mockConfirm.mockResolvedValue(true)

    mockGetGraphQLAPIs.mockResolvedValueOnce([
      {
        dataset: 'production',
        id: 'ios',
        projectId: 'test-project',
        schema,
        tag: 'mobile',
      },
    ])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      uri: '/apis/graphql/production/beta',
    }).reply(204)

    const {stderr, stdout} = await testCommand(Undeploy, ['--api', 'ios', '--tag', 'beta'])

    expect(stdout).toBe('GraphQL API deleted\n')
    expect(stderr).toContain('Both --api and --tag specified, using --tag beta')
  })

  test('throws error when project ID is not defined', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: undefined,
      },
    })

    const {error} = await testCommand(Undeploy, ['--force'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when dataset is not defined and not in config', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: undefined,
        projectId: 'test-project',
      },
    })

    const {error} = await testCommand(Undeploy, ['--force'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(
      'Dataset is required. Specify it with --dataset or configure it in your project.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API deletion error', async () => {
    mockConfirm.mockResolvedValue(true)

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      uri: '/apis/graphql/production/default',
    }).reply(404, {message: 'GraphQL API not found'})

    const {error} = await testCommand(Undeploy)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('GraphQL API deletion failed')
    expect(error?.message).toContain('GraphQL API not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles user cancelling confirmation prompt', async () => {
    mockConfirm.mockRejectedValue(new Error('User cancelled'))

    const {error} = await testCommand(Undeploy)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe('Operation cancelled')
    expect(error?.oclif?.exit).toBe(1)
  })
})
