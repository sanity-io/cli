import {runCommand} from '@oclif/test'
import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DATASET_API_VERSION} from '../../../../services/datasets.js'
import {PROJECT_FEATURES_API_VERSION} from '../../../../services/getProjectFeatures.js'
import {NO_PROJECT_ID} from '../../../../util/errorMessages.js'
import {CreateAliasCommand} from '../create.js'

const mockListDatasets = vi.hoisted(() => vi.fn())
const testProjectId = vi.hoisted(() => 'test-project')
const testToken = vi.hoisted(() => 'test-token')

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  const testClient = createTestClient({
    apiVersion: 'v2025-09-16',
    projectId: testProjectId,
    token: testToken,
  })

  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        list: mockListDatasets,
      } as never,
      request: testClient.request,
    }),
  }
})

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: testToken,
}

describe('#dataset:alias:create', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('help works correctly', async () => {
    const {stdout} = await runCommand(['dataset', 'alias', 'create', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "Create a dataset alias within your project

      USAGE
        $ sanity dataset alias create [ALIASNAME] [TARGETDATASET]

      ARGUMENTS
        [ALIASNAME]      Dataset alias name to create
        [TARGETDATASET]  Target dataset name to link the alias to

      DESCRIPTION
        Create a dataset alias within your project

      EXAMPLES
        Create an alias with interactive prompts

          $ sanity dataset alias create

        Create alias named "conference" with interactive dataset selection

          $ sanity dataset alias create conference

        Create alias "conference" linked to "conf-2025" dataset

          $ sanity dataset alias create conference conf-2025

        Create alias with explicit ~ prefix

          $ sanity dataset alias create ~conference conf-2025

      "
    `)
  })

  test.each([
    ['test-alias', 'without ~ prefix'],
    ['~test-alias', 'with ~ prefix'],
  ])('creates alias with valid arguments: %s (%s)', async (aliasInput) => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: `/features`,
    }).reply(200, ['advancedDatasetManagement'])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      uri: `/aliases`,
    }).reply(200, [])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'put',
      uri: `/aliases/test-alias`,
    }).reply(200, {aliasName: 'test-alias', datasetName: 'production'})

    const {stdout} = await testCommand(CreateAliasCommand, [aliasInput, 'production'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain(
      'Dataset alias ~test-alias created and linked to production successfully',
    )
  })

  test('creates alias without target dataset', async () => {
    mockListDatasets.mockResolvedValue([])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: `/features`,
    }).reply(200, ['advancedDatasetManagement'])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      uri: `/aliases`,
    }).reply(200, [])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'put',
      uri: `/aliases/test-alias`,
    }).reply(200, {aliasName: 'test-alias', datasetName: null})

    const {stdout} = await testCommand(CreateAliasCommand, ['test-alias'], {mocks: defaultMocks})

    expect(stdout).toContain('Dataset alias ~test-alias created successfully')
  })

  test('fails when alias already exists', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: `/features`,
    }).reply(200, ['advancedDatasetManagement'])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      uri: `/aliases`,
    }).reply(200, [{datasetName: 'production', name: 'existing-alias'}])

    const {error} = await testCommand(CreateAliasCommand, ['existing-alias', 'production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Dataset alias "~existing-alias" already exists')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when project lacks advanced dataset management feature', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: `/features`,
    }).reply(200, [])

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('This project cannot create a dataset alias')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when target dataset does not exist', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: `/features`,
    }).reply(200, ['advancedDatasetManagement'])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      uri: `/aliases`,
    }).reply(200, [])

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'nonexistent'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Dataset "nonexistent" does not exist')
    expect(error?.message).toContain('Available datasets: production')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when no project ID available', async () => {
    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'production'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {}},
      },
    })

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API errors gracefully', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: `/features`,
    }).reply(200, ['advancedDatasetManagement'])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      uri: `/aliases`,
    }).reply(200, [])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'put',
      uri: `/aliases/test-alias`,
    }).reply(500, {error: 'API Error: Network timeout', message: 'API Error: Network timeout'})

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Dataset alias creation failed: API Error: Network timeout')
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    ['a', 'production', 'Alias name must be at least two characters long'],
    ['test-alias', 'Invalid Dataset', 'Dataset name must be all lowercase characters'],
  ])('fails with invalid input: alias=%s, dataset=%s', async (alias, dataset, expectedError) => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: `/features`,
    }).reply(200, ['advancedDatasetManagement'])

    const {error} = await testCommand(CreateAliasCommand, [alias, dataset], {mocks: defaultMocks})

    expect(error?.message).toContain(expectedError)
    expect(error?.oclif?.exit).toBe(1)
  })
})
