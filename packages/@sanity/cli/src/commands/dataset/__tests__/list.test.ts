import {runCommand} from '@oclif/test'
import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DATASET_API_VERSION, type DatasetAliasDefinition} from '../../../services/datasets.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {ListDatasetCommand} from '../list.js'

const mockListDatasets = vi.hoisted(() => vi.fn())
const testProjectId = vi.hoisted(() => 'test-project')
const testToken = vi.hoisted(() => 'test-token')

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')

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

describe('#dataset:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['dataset list', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "List datasets of your project

      USAGE
        $ sanity dataset list

      DESCRIPTION
        List datasets of your project

      EXAMPLES
        List datasets of your project

          $ sanity dataset list

      "
    `)
  })

  test('lists datasets successfully', async () => {
    mockListDatasets.mockResolvedValue([
      {name: 'production'} as never,
      {name: 'test'} as never,
      {name: 'development'} as never,
    ])
    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      uri: `/aliases`,
    }).reply(200, [])

    const {stdout} = await testCommand(ListDatasetCommand, [], {
      mocks: defaultMocks,
    })

    expect(stdout).toBe('production\ntest\ndevelopment\n')
  })

  test('lists datasets and aliases successfully', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never, {name: 'test'} as never])
    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      uri: `/aliases`,
    }).reply(200, [
      {datasetName: 'production', name: 'prod'},
      {datasetName: 'test', name: 'staging'},
    ])

    const {stdout} = await testCommand(ListDatasetCommand, [], {
      mocks: defaultMocks,
    })
    expect(stdout).toBe('production\ntest\n~prod -> production\n~staging -> test\n')
  })

  test('handles unlinked aliases', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])
    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      uri: `/aliases`,
    }).reply(200, [
      {datasetName: 'production', name: 'prod'},
      {datasetName: null, name: 'old'},
    ] as DatasetAliasDefinition[])

    const {stdout} = await testCommand(ListDatasetCommand, [], {
      mocks: defaultMocks,
    })
    expect(stdout).toBe('production\n~prod -> production\n~old -> <unlinked>\n')
  })

  test('handles empty dataset list', async () => {
    mockListDatasets.mockResolvedValue([])
    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      uri: `/aliases`,
    }).reply(200, [])

    const {stdout} = await testCommand(ListDatasetCommand, [], {
      mocks: defaultMocks,
    })
    expect(stdout).toBe('No datasets found for this project.\n')
  })

  test('handles alias fetch failure gracefully', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])
    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      uri: `/aliases`,
    }).reply(500, {
      error: 'Alias service unavailable',
      message: 'Alias service unavailable',
    })

    const {stdout} = await testCommand(ListDatasetCommand, [], {
      mocks: defaultMocks,
    })
    expect(stdout).toBe('production\n')
  })

  test('shows error when no project ID is found', async () => {
    const {error} = await testCommand(ListDatasetCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })
    expect(error?.message).toBe(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API errors when listing datasets ', async () => {
    const listError = new Error('Internal Server Error')
    Object.assign(listError, {statusCode: 500})
    mockListDatasets.mockRejectedValue(listError)
    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      uri: `/aliases`,
    }).reply(200, [])

    const {error} = await testCommand(ListDatasetCommand, [], {
      mocks: defaultMocks,
    })
    expect(error?.message).toContain('Dataset list retrieval failed')
    expect(error?.message).toContain('Internal Server Error')
    expect(error?.oclif?.exit).toBe(1)
  })
})
