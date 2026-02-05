import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DATASET_API_VERSION} from '../../../../services/datasets.js'
import {NO_PROJECT_ID} from '../../../../util/errorMessages.js'
import {LinkAliasCommand} from '../link.js'

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

describe('#dataset:alias:link', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('links alias with valid arguments', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'development'}] as never)

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: `/aliases`,
    }).reply(200, [{datasetName: null, name: 'staging'}])

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'patch',
      projectId: testProjectId,
      uri: `/aliases/staging`,
    }).reply(200, {aliasName: 'staging', datasetName: 'production'})

    const {stdout} = await testCommand(LinkAliasCommand, ['staging', 'production'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Dataset alias ~staging linked to production successfully')
  })

  test('re-links already-linked alias when using force flag', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'development'}] as never)

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: `/aliases`,
    }).reply(200, [{datasetName: 'development', name: 'staging'}])

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'patch',
      projectId: testProjectId,
      uri: `/aliases/staging`,
    }).reply(200, {aliasName: 'staging', datasetName: 'production'})

    const {stderr, stdout} = await testCommand(
      LinkAliasCommand,
      ['staging', 'production', '--force'],
      {mocks: defaultMocks},
    )

    expect(stderr).toContain("'--force' used: skipping confirmation, linking alias to")
    expect(stdout).toContain('Dataset alias ~staging linked to production successfully')
  })

  test('links unlinked alias without requiring confirmation', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}] as never)

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: `/aliases`,
    }).reply(200, [{datasetName: null, name: 'staging'}])

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'patch',
      projectId: testProjectId,
      uri: `/aliases/staging`,
    }).reply(200, {aliasName: 'staging', datasetName: 'production'})

    const {stdout} = await testCommand(LinkAliasCommand, ['staging', 'production'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Dataset alias ~staging linked to production successfully')
    expect(stdout).not.toContain('confirmation')
  })

  test.each([
    [
      'invalid-alias-name-that-is-way-too-long-and-exceeds-the-maximum-allowed-length',
      'production',
      'Alias name must be at most 64 characters',
    ],
    ['staging', 'Invalid-Dataset', 'Dataset name must be all lowercase characters'],
  ])('fails with invalid input: alias=%s, dataset=%s', async (alias, dataset, expectedError) => {
    const {error} = await testCommand(LinkAliasCommand, [alias, dataset], {mocks: defaultMocks})

    expect(error?.message).toContain(expectedError)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when no project ID', async () => {
    const {error} = await testCommand(LinkAliasCommand, ['staging', 'production'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {}},
      },
    })

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when alias does not exist', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}] as never)

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: `/aliases`,
    }).reply(200, [{datasetName: null, name: 'staging'}])

    const {error} = await testCommand(LinkAliasCommand, ['nonexistent', 'production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Dataset alias "~nonexistent" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when dataset does not exist', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}] as never)

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: `/aliases`,
    }).reply(200, [{datasetName: null, name: 'staging'}])

    const {error} = await testCommand(LinkAliasCommand, ['staging', 'nonexistent'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Dataset "nonexistent" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when alias already linked to same dataset', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}] as never)

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: `/aliases`,
    }).reply(200, [{datasetName: 'production', name: 'staging'}])

    const {error} = await testCommand(LinkAliasCommand, ['staging', 'production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Dataset alias ~staging already linked to production')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when no datasets available', async () => {
    mockListDatasets.mockResolvedValue([] as never)

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: `/aliases`,
    }).reply(200, [{datasetName: null, name: 'staging'}])

    const {error} = await testCommand(LinkAliasCommand, ['staging'], {mocks: defaultMocks})

    expect(error?.message).toContain('No datasets available to link to')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API error gracefully', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}] as never)

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'get',
      projectId: testProjectId,
      uri: `/aliases`,
    }).reply(200, [{datasetName: null, name: 'staging'}])

    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'patch',
      projectId: testProjectId,
      uri: `/aliases/staging`,
    }).reply(500, {error: 'API Error', message: 'API Error'})

    const {error} = await testCommand(LinkAliasCommand, ['staging', 'production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Dataset alias linking failed: API Error')
    expect(error?.oclif?.exit).toBe(1)
  })
})
