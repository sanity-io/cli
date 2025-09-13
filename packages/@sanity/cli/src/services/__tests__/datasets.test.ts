import {getProjectCliClient} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {DATASET_API_VERSION, deleteDataset, editDatasetAcl, listDatasets} from '../datasets.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

const mockClient = {
  datasets: {
    delete: vi.fn(),
    edit: vi.fn(),
    list: vi.fn(),
  },
}

const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

beforeEach(() => {
  mockGetProjectCliClient.mockResolvedValue(mockClient as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#listDatasets', () => {
  test('calls client.datasets.list with correct parameters', async () => {
    const mockDatasets = [{aclMode: 'private', name: 'production'}]
    mockClient.datasets.list.mockResolvedValue(mockDatasets)

    const result = await listDatasets('test-project')

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.datasets.list).toHaveBeenCalledWith()
    expect(result).toBe(mockDatasets)
  })
})

describe('#deleteDataset', () => {
  test('calls client.datasets.delete with correct parameters', async () => {
    mockClient.datasets.delete.mockResolvedValue(undefined)

    await deleteDataset({datasetName: 'test-dataset', projectId: 'test-project'})

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.datasets.delete).toHaveBeenCalledWith('test-dataset')
  })
})

describe('#editDatasetAcl', () => {
  test('calls client.datasets.edit with correct parameters for private mode', async () => {
    mockClient.datasets.edit.mockResolvedValue({})

    await editDatasetAcl({
      aclMode: 'private',
      datasetName: 'test-dataset',
      projectId: 'test-project',
    })

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.datasets.edit).toHaveBeenCalledWith('test-dataset', {aclMode: 'private'})
  })

  test('calls client.datasets.edit with correct parameters for public mode', async () => {
    mockClient.datasets.edit.mockResolvedValue({})

    await editDatasetAcl({
      aclMode: 'public',
      datasetName: 'my-dataset',
      projectId: 'my-project',
    })

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_API_VERSION,
      projectId: 'my-project',
      requireUser: true,
    })
    expect(mockClient.datasets.edit).toHaveBeenCalledWith('my-dataset', {aclMode: 'public'})
  })

  test('propagates errors from client', async () => {
    const error = new Error('API error')
    mockClient.datasets.edit.mockRejectedValue(error)

    await expect(
      editDatasetAcl({
        aclMode: 'private',
        datasetName: 'test-dataset',
        projectId: 'test-project',
      }),
    ).rejects.toThrow('API error')
  })
})
