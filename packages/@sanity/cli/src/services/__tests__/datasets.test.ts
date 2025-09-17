import {getProjectCliClient} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {DATASET_API_VERSION, deleteDataset, listDatasets} from '../datasets.js'

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
