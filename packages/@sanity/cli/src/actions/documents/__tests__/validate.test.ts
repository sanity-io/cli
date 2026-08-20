import {type InitializedClientConfig} from '@sanity/client'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type ValidateDocumentsWorkerData} from '../types.js'
import {validateDocuments} from '../validate.js'

const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockCreateStudioWorker = vi.hoisted(() => vi.fn())
const mockReceiverFrom = vi.hoisted(() => vi.fn())
const mockUnsubscribe = vi.hoisted(() => vi.fn())
const mockTerminate = vi.hoisted(() => vi.fn())
const mockClientConfig = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/apiClient', () => ({
  getGlobalCliClient: mockGetGlobalCliClient,
}))
vi.mock('@sanity/cli-core/tasks', () => ({
  createStudioWorker: mockCreateStudioWorker,
}))
vi.mock('@sanity/worker-channels', () => ({
  WorkerChannelReceiver: {from: mockReceiverFrom},
}))

const noop = () => {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noopRequester = noop as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noopResolveFetch = (() => noop) as any

/**
 * The client config `@sanity/client` v8 hands back from `client.config()`:
 * serializable values alongside function-valued properties (the CLI's request
 * handler plus the client's own requester and fetch resolver).
 */
function createClientConfig(
  overrides: Partial<InitializedClientConfig> = {},
): InitializedClientConfig {
  return {
    apiHost: 'https://api.sanity.io',
    apiVersion: '2025-02-19',
    cdnUrl: 'https://api.sanity.io/v2025-02-19',
    ignoreBrowserTokenWarning: true,
    isDefaultApi: true,
    requester: noopRequester,
    requestHandler: async (request, next) => next(request),
    requestTagPrefix: 'sanity.cli',
    resolveFetch: noopResolveFetch,
    stega: {enabled: false},
    token: 'sanity-token',
    url: 'https://api.sanity.io/v2025-02-19',
    useCdn: false,
    useProjectHostname: false,
    ...overrides,
  }
}

function getWorkerData(): ValidateDocumentsWorkerData {
  expect(mockCreateStudioWorker).toHaveBeenCalledTimes(1)
  return mockCreateStudioWorker.mock.calls[0][1].workerData as ValidateDocumentsWorkerData
}

async function* emptyStream() {
  // no validation results
}

beforeEach(() => {
  mockClientConfig.mockReturnValue(createClientConfig())
  mockGetGlobalCliClient.mockResolvedValue({config: mockClientConfig})
  mockTerminate.mockResolvedValue(0)
  mockCreateStudioWorker.mockReturnValue({terminate: mockTerminate})
  mockReceiverFrom.mockReturnValue({
    event: {},
    stream: {validation: emptyStream},
    unsubscribe: mockUnsubscribe,
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('validateDocuments', () => {
  test('worker data can be structurally cloned even when the client config holds functions', async () => {
    await validateDocuments({workDir: '/studio'})

    const workerData = getWorkerData()

    // `createStudioWorker` posts this object across the worker boundary, which
    // clones it structurally. Anything non-clonable left in here throws a
    // `DataCloneError` before validation can start.
    expect(() => structuredClone(workerData)).not.toThrow()
    expect(() => structuredClone(workerData.clientConfig)).not.toThrow()
  })

  test('drops function-valued client config properties', async () => {
    await validateDocuments({workDir: '/studio'})

    const {clientConfig} = getWorkerData()

    expect(clientConfig).not.toHaveProperty('requestHandler')
    expect(clientConfig).not.toHaveProperty('requester')
    expect(clientConfig).not.toHaveProperty('resolveFetch')
    expect(Object.values(clientConfig ?? {}).some((value) => typeof value === 'function')).toBe(
      false,
    )
  })

  test('drops nested function-valued client config properties', async () => {
    mockClientConfig.mockReturnValue(
      createClientConfig({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stega: {enabled: true, filter: () => true} as any,
      }),
    )

    await validateDocuments({workDir: '/studio'})

    const {clientConfig} = getWorkerData()

    expect(clientConfig?.stega).toEqual({enabled: true})
    expect(() => structuredClone(getWorkerData())).not.toThrow()
  })

  test('keeps the client config properties the worker needs to rebuild its client', async () => {
    await validateDocuments({workDir: '/studio'})

    const {clientConfig} = getWorkerData()

    expect(clientConfig).toMatchObject({
      apiHost: 'https://api.sanity.io',
      apiVersion: '2025-02-19',
      requestTagPrefix: 'sanity.cli',
      token: 'sanity-token',
      useCdn: false,
    })
  })

  test('forces the browser token warning off and project hostnames on', async () => {
    await validateDocuments({workDir: '/studio'})

    const {clientConfig} = getWorkerData()

    expect(clientConfig?.ignoreBrowserTokenWarning).toBe(true)
    expect(clientConfig?.useProjectHostname).toBe(true)
  })

  test('requests an authenticated client for the documents API', async () => {
    await validateDocuments({workDir: '/studio'})

    expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
      apiVersion: expect.any(String),
      requireUser: true,
    })
  })

  test('forwards the remaining options to the worker', async () => {
    await validateDocuments({
      dataset: 'production',
      level: 'error',
      maxCustomValidationConcurrency: 3,
      maxFetchConcurrency: 5,
      ndjsonFilePath: '/tmp/docs.ndjson',
      projectId: 'abc123',
      studioHost: 'example',
      workDir: '/studio',
      workspace: 'default',
    })

    expect(getWorkerData()).toMatchObject({
      dataset: 'production',
      level: 'error',
      maxCustomValidationConcurrency: 3,
      maxFetchConcurrency: 5,
      ndjsonFilePath: '/tmp/docs.ndjson',
      projectId: 'abc123',
      studioHost: 'example',
      workDir: '/studio',
      workspace: 'default',
    })
    expect(mockCreateStudioWorker).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({name: 'validateDocuments', studioRootPath: '/studio'}),
    )
  })

  test('defaults the work directory to the current working directory', async () => {
    await validateDocuments({})

    expect(getWorkerData().workDir).toBe(process.cwd())
  })

  test('the default reporter yields validation results and disposes the worker', async () => {
    const validationResult = {
      documentId: 'doc-1',
      documentType: 'post',
      intentUrl: 'https://example.com/intent',
      level: 'error' as const,
      markers: [],
      revision: 'rev-1',
      validatedCount: 1,
    }

    mockReceiverFrom.mockReturnValue({
      event: {},
      stream: {
        validation: async function* () {
          yield validationResult
        },
      },
      unsubscribe: mockUnsubscribe,
    })

    const results = await validateDocuments({workDir: '/studio'})

    const collected = []
    for await (const result of results) collected.push(result)

    // `intentUrl` and `validatedCount` are stream metadata, not part of the
    // reported result
    expect(collected).toEqual([
      {
        documentId: 'doc-1',
        documentType: 'post',
        level: 'error',
        markers: [],
        revision: 'rev-1',
      },
    ])
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
    expect(mockTerminate).toHaveBeenCalledTimes(1)
  })

  test('a custom reporter receives the worker channel receiver', async () => {
    const reporter = vi.fn().mockReturnValue('reported')

    const result = await validateDocuments({reporter, workDir: '/studio'})

    expect(result).toBe('reported')
    expect(reporter).toHaveBeenCalledWith({
      dispose: expect.any(Function),
      event: expect.anything(),
      stream: expect.anything(),
    })

    // the receiver's dispose unsubscribes before terminating the worker
    await reporter.mock.calls[0][0].dispose()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
    expect(mockTerminate).toHaveBeenCalledTimes(1)
  })
})
