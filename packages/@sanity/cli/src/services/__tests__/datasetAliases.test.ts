import {getProjectCliClient} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  createAlias,
  DATASET_ALIASES_API_VERSION,
  listAliases,
  removeAlias,
  updateAlias,
} from '../datasetAliases.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

const mockClient = {
  request: vi.fn(),
}

const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

beforeEach(() => {
  mockGetProjectCliClient.mockResolvedValue(mockClient as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#listAliases', () => {
  test('calls client.request with correct parameters', async () => {
    const mockAliases = [
      {datasetName: 'production', name: 'prod'},
      {datasetName: 'development', name: 'dev'},
    ]
    mockClient.request.mockResolvedValue(mockAliases)

    const result = await listAliases('test-project')

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.request).toHaveBeenCalledWith({uri: '/aliases'})
    expect(result).toBe(mockAliases)
  })
})

describe('#createAlias', () => {
  test('calls client.request with correct parameters when datasetName is provided', async () => {
    const mockResponse = {aliasName: 'prod', datasetName: 'production'}
    mockClient.request.mockResolvedValue(mockResponse)

    const result = await createAlias('test-project', 'prod', 'production')

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.request).toHaveBeenCalledWith({
      body: {datasetName: 'production'},
      method: 'PUT',
      uri: '/aliases/prod',
    })
    expect(result).toBe(mockResponse)
  })

  test('calls client.request with undefined body when datasetName is null', async () => {
    const mockResponse = {aliasName: 'prod', datasetName: null}
    mockClient.request.mockResolvedValue(mockResponse)

    const result = await createAlias('test-project', 'prod', null)

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.request).toHaveBeenCalledWith({
      body: undefined,
      method: 'PUT',
      uri: '/aliases/prod',
    })
    expect(result).toBe(mockResponse)
  })
})

describe('#removeAlias', () => {
  test('calls client.request with correct parameters', async () => {
    const mockResponse = {deleted: true}
    mockClient.request.mockResolvedValue(mockResponse)

    const result = await removeAlias('test-project', 'test-alias')

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'DELETE',
      uri: '/aliases/test-alias',
    })
    expect(result).toBe(mockResponse)
  })
})

describe('#updateAlias', () => {
  test('calls client.request with correct parameters', async () => {
    const mockResponse = {aliasName: 'prod', datasetName: 'production'}
    mockClient.request.mockResolvedValue(mockResponse)

    const result = await updateAlias('test-project', 'prod', 'production')

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.request).toHaveBeenCalledWith({
      body: {datasetName: 'production'},
      method: 'PATCH',
      uri: '/aliases/prod',
    })
    expect(result).toBe(mockResponse)
  })
})
