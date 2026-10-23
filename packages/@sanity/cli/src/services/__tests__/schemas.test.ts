import {getGlobalCliClient} from '@sanity/cli-core'
import {EXPERIMENTAL_API_WARNING} from '@sanity/client'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  getDatasetSchemaBinding,
  getSchemaDescriptor,
  SCHEMA_BINDING_API_VERSION,
  SCHEMA_DESCRIPTOR_API_VERSION,
} from '../schemas.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getGlobalCliClient: vi.fn(),
  }
})

const mockClient = {
  request: vi.fn(),
}

const mockGetGlobalCliClient = vi.mocked(getGlobalCliClient)

/** An error that passes the client's `isHttpError()` check. */
function httpError(statusCode: number) {
  return Object.assign(new Error(`HTTP ${statusCode}`), {
    response: {body: {}, headers: {}, method: 'GET', statusCode, url: '/schemas/dataset'},
    statusCode,
  })
}

beforeEach(() => {
  mockGetGlobalCliClient.mockResolvedValue(mockClient as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#getDatasetSchemaBinding', () => {
  test('reads the binding by project ID and dataset on the experimental API version', async () => {
    const binding = {
      _meta: {producer: 'api', schemaVersion: 'abc', source: null, sourceLabel: null},
    }
    mockClient.request.mockResolvedValue(binding)

    const result = await getDatasetSchemaBinding('abc123', 'production')

    expect(SCHEMA_BINDING_API_VERSION).toBe('vX')
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
      apiVersion: 'vX',
      ignoreWarnings: [EXPERIMENTAL_API_WARNING, 'which will change without warning'],
      requireUser: true,
    })
    expect(mockClient.request).toHaveBeenCalledWith({url: '/schemas/dataset/abc123.production'})
    expect(result).toBe(binding)
  })

  test('returns null when the dataset has no binding', async () => {
    mockClient.request.mockRejectedValue(httpError(404))

    await expect(getDatasetSchemaBinding('abc123', 'production')).resolves.toBeNull()
  })

  test('rethrows other errors', async () => {
    const error = httpError(403)
    mockClient.request.mockRejectedValue(error)

    await expect(getDatasetSchemaBinding('abc123', 'production')).rejects.toBe(error)
  })
})

describe('#getSchemaDescriptor', () => {
  test('reads the descriptor by ID', async () => {
    const descriptor = {hoisted: {}, registries: [], types: {}}
    mockClient.request.mockResolvedValue(descriptor)

    const result = await getSchemaDescriptor('uEiB/abc')

    expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
      apiVersion: SCHEMA_DESCRIPTOR_API_VERSION,
      requireUser: true,
    })
    expect(SCHEMA_DESCRIPTOR_API_VERSION).toBe('v2025-06-01')
    expect(mockClient.request).toHaveBeenCalledWith({url: '/descriptors/schemas/uEiB%2Fabc'})
    expect(result).toBe(descriptor)
  })
})
