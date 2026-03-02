import {afterEach, describe, expect, test, vi} from 'vitest'

import {getGraphQLAPIs} from '../getGraphQLAPIs.js'
import {SchemaError} from '../SchemaError.js'

const mockGetCliConfig = vi.hoisted(() => vi.fn())
const mockFindStudioConfigPath = vi.hoisted(() => vi.fn())
const mockStudioWorkerTask = vi.hoisted(() => vi.fn())

vi.mock('node:worker_threads', () => ({
  isMainThread: true,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal()),
  findStudioConfigPath: mockFindStudioConfigPath,
  getCliConfig: mockGetCliConfig,
  studioWorkerTask: mockStudioWorkerTask,
}))

describe('getGraphQLAPIs', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('calls studioWorkerTask with correct parameters', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {projectId: 'test-project'},
      graphql: [{id: 'api1'}],
    })
    mockFindStudioConfigPath.mockResolvedValue('/path/to/sanity.config.ts')
    mockStudioWorkerTask.mockResolvedValue({
      apis: [{dataset: 'production', projectId: 'test-project', tag: 'default'}],
    })

    const result = await getGraphQLAPIs('/test/workdir')

    expect(mockStudioWorkerTask).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('getGraphQLAPIs.worker.js'),
      }),
      expect.objectContaining({
        name: 'getGraphQLAPIs',
        studioRootPath: '/test/workdir',
        workerData: {
          cliConfig: {
            api: {projectId: 'test-project'},
            graphql: [{id: 'api1'}],
          },
          configPath: '/path/to/sanity.config.ts',
        },
      }),
    )

    expect(result).toEqual([
      {dataset: 'production', projectId: 'test-project', tag: 'default'},
    ])
  })

  test('extracts only api and graphql from CLI config', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {projectId: 'test'},
      graphql: [{id: 'test'}],
      vite: () => ({}),
    })
    mockFindStudioConfigPath.mockResolvedValue('/config')
    mockStudioWorkerTask.mockResolvedValue({apis: []})

    await getGraphQLAPIs('/test/workdir')

    const workerData = mockStudioWorkerTask.mock.calls[0][1].workerData
    expect(workerData.cliConfig).toEqual({
      api: {projectId: 'test'},
      graphql: [{id: 'test'}],
    })
    expect(workerData.cliConfig).not.toHaveProperty('vite')
  })

  test('returns worker results directly', async () => {
    mockGetCliConfig.mockResolvedValue({api: {}})
    mockFindStudioConfigPath.mockResolvedValue('/config')

    const apis = [
      {dataset: 'production', id: 'api1', projectId: 'p1', tag: 'default'},
      {dataset: 'staging', id: 'api2', projectId: 'p1', tag: 'staging'},
    ]
    mockStudioWorkerTask.mockResolvedValue({apis})

    const result = await getGraphQLAPIs('/test/workdir')
    expect(result).toEqual(apis)
  })

  test('throws SchemaError when worker returns configErrors', async () => {
    mockGetCliConfig.mockResolvedValue({api: {}})
    mockFindStudioConfigPath.mockResolvedValue('/config')

    const configErrors = [
      {
        path: [{kind: 'type', name: 'post', type: 'document'}],
        problems: [{message: 'Unknown type: "nonExistent"', severity: 'error'}],
      },
    ]
    mockStudioWorkerTask.mockResolvedValue({apis: [], configErrors})

    const error: unknown = await getGraphQLAPIs('/test/workdir').catch((err) => err)
    expect(error).toBeInstanceOf(SchemaError)
    expect(error).toHaveProperty('message', 'Schema errors encountered')
  })

  test('does not throw when configErrors is empty', async () => {
    mockGetCliConfig.mockResolvedValue({api: {}})
    mockFindStudioConfigPath.mockResolvedValue('/config')

    mockStudioWorkerTask.mockResolvedValue({apis: [], configErrors: []})

    const result = await getGraphQLAPIs('/test/workdir')
    expect(result).toEqual([])
  })
})
