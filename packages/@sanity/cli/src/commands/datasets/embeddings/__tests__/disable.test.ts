import {select} from '@sanity/cli-core/ux'
import {testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DatasetEmbeddingsDisableCommand} from '../disable.js'

const mockListDatasets = vi.hoisted(() => vi.fn())
const mockEditEmbeddingsSettings = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        editEmbeddingsSettings: mockEditEmbeddingsSettings,
        list: mockListDatasets,
      } as never,
    }),
  }
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    select: vi.fn(),
  }
})

const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockSelect = vi.mocked(select)

describe('#dataset:embeddings:disable', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    vi.restoreAllMocks()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('should disable embeddings for specified dataset', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])
    mockEditEmbeddingsSettings.mockResolvedValue(undefined)

    const {stdout} = await testCommand(DatasetEmbeddingsDisableCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(mockEditEmbeddingsSettings).toHaveBeenCalledWith('production', {enabled: false})
    expect(stdout).toContain('Disabled embeddings for dataset production')
    expect(stdout).toContain('Existing embedding data will be removed')
  })

  test('should prompt for dataset when none specified', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])
    mockEditEmbeddingsSettings.mockResolvedValue(undefined)
    mockSelect.mockResolvedValue('production')

    const {stdout} = await testCommand(DatasetEmbeddingsDisableCommand, [], {mocks: defaultMocks})

    expect(mockSelect).toHaveBeenCalled()
    expect(stdout).toContain('Disabled embeddings for dataset production')
  })

  test('should surface API errors from disable call', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])
    mockEditEmbeddingsSettings.mockRejectedValue(new Error('API request failed'))

    const {error} = await testCommand(DatasetEmbeddingsDisableCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to disable embeddings: API request failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should error when specified dataset does not exist', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

    const {error} = await testCommand(DatasetEmbeddingsDisableCommand, ['nonexistent'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain("Dataset 'nonexistent' not found")
    expect(error?.oclif?.exit).toBe(1)
  })
})
