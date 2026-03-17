import {select} from '@sanity/cli-core/ux'
import {testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DatasetEmbeddingsEnableCommand} from '../enable.js'

const mockListDatasets = vi.hoisted(() => vi.fn())
const mockGetEmbeddingsSettings = vi.hoisted(() => vi.fn())
const mockEditEmbeddingsSettings = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        editEmbeddingsSettings: mockEditEmbeddingsSettings,
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
    spinner: () => ({
      fail: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      set text(_: string) {},
    }),
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

describe('#dataset:embeddings:enable', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    vi.restoreAllMocks()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('should enable embeddings for specified dataset', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])
    mockEditEmbeddingsSettings.mockResolvedValue(undefined)

    const {stdout} = await testCommand(DatasetEmbeddingsEnableCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(mockEditEmbeddingsSettings).toHaveBeenCalledWith('production', {enabled: true})
    expect(stdout).toContain('Embeddings enabled for dataset production')
    expect(stdout).toContain('Processing documents in the background')
  })

  test('should pass projection to the API', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])
    mockEditEmbeddingsSettings.mockResolvedValue(undefined)

    const {stdout} = await testCommand(
      DatasetEmbeddingsEnableCommand,
      ['production', '--projection', '{ title, body }'],
      {mocks: defaultMocks},
    )

    expect(mockEditEmbeddingsSettings).toHaveBeenCalledWith('production', {
      enabled: true,
      projection: '{ title, body }',
    })
    expect(stdout).toContain('Projection: { title, body }')
  })

  test('should prompt for dataset when none specified', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])
    mockEditEmbeddingsSettings.mockResolvedValue(undefined)
    mockSelect.mockResolvedValue('staging')

    const {stdout} = await testCommand(DatasetEmbeddingsEnableCommand, [], {mocks: defaultMocks})

    expect(mockSelect).toHaveBeenCalled()
    expect(stdout).toContain('Embeddings enabled for dataset staging')
  })

  test('--wait should poll until status is ready', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback: () => void) => {
      callback()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })
    mockListDatasets.mockResolvedValue([{name: 'production'}])
    mockEditEmbeddingsSettings.mockResolvedValue(undefined)
    mockGetEmbeddingsSettings
      .mockResolvedValueOnce({enabled: true, status: 'updating'})
      .mockResolvedValueOnce({enabled: true, status: 'ready'})

    const {stdout} = await testCommand(DatasetEmbeddingsEnableCommand, ['production', '--wait'], {
      mocks: defaultMocks,
    })

    expect(mockGetEmbeddingsSettings).toHaveBeenCalledTimes(2)
    expect(stdout).toContain('Embeddings enabled for dataset production')
  })

  test('--wait should error on unexpected status', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback: () => void) => {
      callback()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })
    mockListDatasets.mockResolvedValue([{name: 'production'}])
    mockEditEmbeddingsSettings.mockResolvedValue(undefined)
    mockGetEmbeddingsSettings.mockResolvedValueOnce({enabled: true, status: 'failed'})

    const {error} = await testCommand(DatasetEmbeddingsEnableCommand, ['production', '--wait'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Embeddings entered unexpected status: failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should surface API errors from enable call', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])
    mockEditEmbeddingsSettings.mockRejectedValue(new Error('Forbidden'))

    const {error} = await testCommand(DatasetEmbeddingsEnableCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to enable embeddings: Forbidden')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should error when specified dataset does not exist', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

    const {error} = await testCommand(DatasetEmbeddingsEnableCommand, ['nonexistent'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain("Dataset 'nonexistent' not found")
    expect(error?.oclif?.exit).toBe(1)
  })
})
