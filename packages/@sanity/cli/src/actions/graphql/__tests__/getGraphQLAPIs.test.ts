import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getGraphQLAPIs} from '../getGraphQLAPIs.js'

const {MockWorker, mockWorkerConstructor, setMockWorkerImplementation} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockWorkerImplementation: any = null
  const mockWorkerConstructor = vi.fn()

  class MockWorker {
    constructor(...args: unknown[]) {
      // Track constructor calls
      mockWorkerConstructor(...args)

      if (mockWorkerImplementation) {
        return mockWorkerImplementation(...args)
      }
      return {
        on: vi.fn(),
        terminate: vi.fn(),
      }
    }
  }

  return {
    MockWorker,
    mockWorkerConstructor,
    setMockWorkerImplementation: (impl: unknown) => {
      mockWorkerImplementation = impl
    },
  }
})

const mockGetCliConfig = vi.hoisted(() => vi.fn())
const mockGetStudioConfig = vi.hoisted(() => vi.fn())
const mockResolveLocalPackage = vi.hoisted(() => vi.fn())

// Mock dependencies
vi.mock('node:worker_threads', () => ({
  isMainThread: true,
  Worker: MockWorker,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal()),
  getCliConfig: mockGetCliConfig,
  getStudioConfig: mockGetStudioConfig,
  resolveLocalPackage: mockResolveLocalPackage,
}))

describe('getGraphQLAPIs', () => {
  let testResponse: unknown

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mocks
    mockGetCliConfig.mockResolvedValue({
      api: {projectId: 'test-project'},
      graphql: [],
    })

    mockGetStudioConfig.mockResolvedValue([
      {
        dataset: 'production',
        name: 'default',
        projectId: 'test-project',
        unstable_sources: [
          {
            dataset: 'production',
            name: 'default',
            projectId: 'test-project',
            schema: {
              _original: {
                types: [
                  {name: 'customType', type: 'document'},
                  {name: 'string', type: 'string'},
                ],
              },
            },
          },
        ],
      },
    ])

    // Mock resolveLocalPackage to return a mock sanity package with createSchema
    mockResolveLocalPackage.mockResolvedValue({
      createSchema: vi.fn(({name, types}) => ({
        getTypeNames: vi.fn(() => []),
        name,
        types,
      })),
    })

    // Default successful worker response
    testResponse = [
      {
        dataset: 'production',
        id: 'default',
        projectId: 'test-project',
        schemaTypes: [{name: 'customType', type: 'document'}],
        tag: 'default',
      },
    ]

    // Mock worker instance
    const mockWorkerInstance = {
      addListener: vi.fn((event, callback) => {
        if (event === 'message') {
          setImmediate(() => callback(testResponse))
        }
      }),
      removeAllListeners: vi.fn(),
      terminate: vi.fn(),
    }

    setMockWorkerImplementation(() => mockWorkerInstance)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('successfully returns GraphQL APIs with schema', async () => {
    const result = await getGraphQLAPIs('/test/workdir')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      dataset: 'production',
      projectId: 'test-project',
      tag: 'default',
    })
    expect(result[0].schema).toBeDefined()
    expect(result[0].schema.name).toBe('default')
  })

  test('calls worker with correct parameters', async () => {
    await getGraphQLAPIs('/test/workdir')

    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('/actions/graphql/getGraphQLAPIs.worker.js'),
      }),
      expect.objectContaining({
        env: process.env,
        workerData: expect.objectContaining({
          workDir: '/test/workdir',
        }),
      }),
    )
  })

  test('handles multiple GraphQL APIs', async () => {
    // Create a new worker instance with custom response
    const mockWorkerInstance = {
      addListener: vi.fn((event, callback) => {
        if (event === 'message') {
          setImmediate(() =>
            callback([
              {
                dataset: 'production',
                id: 'production',
                projectId: 'test-project',
                schemaTypes: [{name: 'product', type: 'document'}],
                tag: 'default',
              },
              {
                dataset: 'staging',
                id: 'staging',
                projectId: 'test-project',
                schemaTypes: [{name: 'testProduct', type: 'document'}],
                tag: 'beta',
              },
            ]),
          )
        }
      }),
      removeAllListeners: vi.fn(),
      terminate: vi.fn(),
    }

    setMockWorkerImplementation(() => mockWorkerInstance)

    const result = await getGraphQLAPIs('/test/workdir')

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      dataset: 'production',
      id: 'production',
      tag: 'default',
    })
    expect(result[1]).toMatchObject({
      dataset: 'staging',
      id: 'staging',
      tag: 'beta',
    })
  })

  test('handles worker error event', async () => {
    const workerError = new Error('Worker failed')

    const mockWorkerInstance = {
      addListener: vi.fn((event, callback) => {
        if (event === 'error') {
          setImmediate(() => callback(workerError))
        }
      }),
      removeAllListeners: vi.fn(),
      terminate: vi.fn(),
    }

    setMockWorkerImplementation(() => mockWorkerInstance)

    await expect(getGraphQLAPIs('/test/workdir')).rejects.toThrow('Worker error: Worker failed')
  })

  test('handles worker exit with non-zero code', async () => {
    const mockWorkerInstance = {
      addListener: vi.fn((event, callback) => {
        if (event === 'exit') {
          setImmediate(() => callback(1))
        }
      }),
      removeAllListeners: vi.fn(),
      terminate: vi.fn(),
    }

    setMockWorkerImplementation(() => mockWorkerInstance)

    await expect(getGraphQLAPIs('/test/workdir')).rejects.toThrow('Worker exited with code 1')
  })

  test('passes CLI config to worker', async () => {
    const cliConfig = {
      api: {projectId: 'custom-project'},
      graphql: [{dataset: 'prod', id: 'api1'}],
    }

    mockGetCliConfig.mockResolvedValueOnce(cliConfig)

    await getGraphQLAPIs('/test/workdir')

    const workerCall = mockWorkerConstructor.mock.calls[0]
    expect(workerCall[1].workerData.cliConfig).toEqual(cliConfig)
  })

  test('passes studio workspaces to worker', async () => {
    const workspaces = [
      {
        dataset: 'production',
        name: 'default',
        projectId: 'test-project',
        unstable_sources: [
          {
            dataset: 'production',
            name: 'default',
            projectId: 'test-project',
            schema: {_original: {types: []}},
          },
        ],
      },
    ]

    mockGetStudioConfig.mockResolvedValueOnce(workspaces)

    await getGraphQLAPIs('/test/workdir')

    const workerCall = mockWorkerConstructor.mock.calls[0]
    expect(workerCall[1].workerData.workspaces).toEqual(workspaces)
  })

  test('extracts only GraphQL-related config properties', async () => {
    const configWithFunction = {
      api: {projectId: 'test'},
      graphql: [{id: 'test'}],
      vite: () => ({}), // Function that can't be serialized
    }

    mockGetCliConfig.mockResolvedValueOnce(configWithFunction)

    await getGraphQLAPIs('/test/workdir')

    // Verify only api and graphql properties were passed to worker
    const workerCall = mockWorkerConstructor.mock.calls[0]
    const workerData = workerCall[1].workerData

    expect(workerData.cliConfig).toEqual({
      api: {projectId: 'test'},
      graphql: [{id: 'test'}],
    })
    // Verify the vite function was not included
    expect(workerData.cliConfig).not.toHaveProperty('vite')
  })
})
