import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DATASET_ALIASES_API_VERSION} from '../../../../services/datasetAliases.js'
import {listDatasets} from '../../../../services/datasets.js'
import {PROJECT_FEATURES_API_VERSION} from '../../../../services/getProjectFeatures.js'
import {NO_PROJECT_ID} from '../../../../util/errorMessages.js'
import {CreateAliasCommand} from '../create.js'

vi.mock('../../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../../services/datasets.js', () => ({
  listDatasets: vi.fn(),
}))

const mockListDatasets = vi.mocked(listDatasets)
const mockGetCliConfig = vi.mocked(getCliConfig)

describe('#dataset:alias:create', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test.each([
    ['test-alias', 'without ~ prefix'],
    ['~test-alias', 'with ~ prefix'],
  ])('creates alias with valid arguments: %s (%s)', async (aliasInput) => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: PROJECT_FEATURES_API_VERSION,
      uri: '/features',
    }).reply(200, ['advancedDatasetManagement'])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'put',
      uri: '/aliases/test-alias',
    }).reply(200, {aliasName: 'test-alias', datasetName: 'production'})

    const {stdout} = await testCommand(CreateAliasCommand, [aliasInput, 'production'])

    expect(stdout).toContain(
      'Dataset alias ~test-alias created and linked to production successfully',
    )
  })

  test('creates alias without target dataset', async () => {
    mockListDatasets.mockResolvedValue([])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: PROJECT_FEATURES_API_VERSION,
      uri: '/features',
    }).reply(200, ['advancedDatasetManagement'])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'put',
      uri: '/aliases/test-alias',
    }).reply(200, {aliasName: 'test-alias', datasetName: null})

    const {stdout} = await testCommand(CreateAliasCommand, ['test-alias'])

    expect(stdout).toContain('Dataset alias ~test-alias created successfully')
  })

  test('fails when alias already exists', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: PROJECT_FEATURES_API_VERSION,
      uri: '/features',
    }).reply(200, ['advancedDatasetManagement'])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [{datasetName: 'production', name: 'existing-alias'}])

    const {error} = await testCommand(CreateAliasCommand, ['existing-alias', 'production'])

    expect(error?.message).toContain('Dataset alias "~existing-alias" already exists')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when project lacks advanced dataset management feature', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: PROJECT_FEATURES_API_VERSION,
      uri: '/features',
    }).reply(200, [])

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'production'])

    expect(error?.message).toContain('This project cannot create a dataset alias')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when target dataset does not exist', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: PROJECT_FEATURES_API_VERSION,
      uri: '/features',
    }).reply(200, ['advancedDatasetManagement'])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [])

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'nonexistent'])

    expect(error?.message).toContain('Dataset "nonexistent" does not exist')
    expect(error?.message).toContain('Available datasets: production')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when no project ID available', async () => {
    mockGetCliConfig.mockResolvedValueOnce({
      api: {},
    })

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'production'])

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API errors gracefully', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: PROJECT_FEATURES_API_VERSION,
      uri: '/features',
    }).reply(200, ['advancedDatasetManagement'])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'put',
      uri: '/aliases/test-alias',
    }).reply(500, {message: 'API Error: Network timeout'})

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'production'])

    expect(error?.message).toContain('Dataset alias creation failed: API Error: Network timeout')
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    ['a', 'production', 'Alias name must be at least two characters long'],
    ['test-alias', 'Invalid Dataset', 'Dataset name must be all lowercase characters'],
  ])('fails with invalid input: alias=%s, dataset=%s', async (alias, dataset, expectedError) => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: PROJECT_FEATURES_API_VERSION,
      uri: '/features',
    }).reply(200, ['advancedDatasetManagement'])

    const {error} = await testCommand(CreateAliasCommand, [alias, dataset])

    expect(error?.message).toContain(expectedError)
    expect(error?.oclif?.exit).toBe(1)
  })
})
