import {select} from '@sanity/cli-core/ux'
import {testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DatasetEmbeddingsStatusCommand} from '../status.js'

const mockListDatasets = vi.hoisted(() => vi.fn())
const mockGetEmbeddingsSettings = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        getEmbeddingsSettings: mockGetEmbeddingsSettings,
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

describe('#dataset:embeddings:status', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    vi.restoreAllMocks()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('should display all fields for enabled dataset with projection', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])
    mockGetEmbeddingsSettings.mockResolvedValue({
      enabled: true,
      projection: '{ title, body }',
      status: 'ready',
    })

    const {stdout} = await testCommand(DatasetEmbeddingsStatusCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(mockGetEmbeddingsSettings).toHaveBeenCalledWith('production')
    expect(stdout).toContain('Dataset:    production')
    expect(stdout).toContain('Embeddings: enabled')
    expect(stdout).toContain('Projection: { title, body }')
    expect(stdout).toContain('Status:     ready')
  })

  test('should show disabled status and omit projection when unset', async () => {
    mockListDatasets.mockResolvedValue([{name: 'staging'}])
    mockGetEmbeddingsSettings.mockResolvedValue({
      enabled: false,
      status: 'inactive',
    })

    const {stdout} = await testCommand(DatasetEmbeddingsStatusCommand, ['staging'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Embeddings: disabled')
    expect(stdout).toContain('Status:     inactive')
    expect(stdout).not.toContain('Projection:')
  })

  test('should prompt for dataset when none specified', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])
    mockGetEmbeddingsSettings.mockResolvedValue({
      enabled: true,
      status: 'ready',
    })
    mockSelect.mockResolvedValue('staging')

    const {stdout} = await testCommand(DatasetEmbeddingsStatusCommand, [], {mocks: defaultMocks})

    expect(mockSelect).toHaveBeenCalled()
    expect(stdout).toContain('Dataset:    staging')
  })

  test('should surface API errors from settings call', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])
    mockGetEmbeddingsSettings.mockRejectedValue(new Error('Not found'))

    const {error} = await testCommand(DatasetEmbeddingsStatusCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to get embeddings settings: Not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should error when specified dataset does not exist', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

    const {error} = await testCommand(DatasetEmbeddingsStatusCommand, ['nonexistent'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain("Dataset 'nonexistent' not found")
    expect(error?.oclif?.exit).toBe(1)
  })
})
