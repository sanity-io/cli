import {getProjectCliClient} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  checkDocumentAvailability,
  DOCUMENTS_API_VERSION,
  exportDocuments,
  getDocumentCount,
} from '../documents.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

const mockClient = {
  config: vi.fn(),
  fetch: vi.fn(),
  getDataUrl: vi.fn(),
  getUrl: vi.fn(),
  request: vi.fn(),
}

const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

beforeEach(() => {
  mockGetProjectCliClient.mockResolvedValue(mockClient as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#getDocumentCount', () => {
  test('calls client.fetch with length(*) query', async () => {
    mockClient.fetch.mockResolvedValue(42)

    const result = await getDocumentCount({dataset: 'production', projectId: 'test-project'})

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DOCUMENTS_API_VERSION,
      dataset: 'production',
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.fetch).toHaveBeenCalledWith('length(*)')
    expect(result).toBe(42)
  })

  test('returns 0 when dataset is empty', async () => {
    mockClient.fetch.mockResolvedValue(0)

    const result = await getDocumentCount({dataset: 'production', projectId: 'test-project'})

    expect(result).toBe(0)
  })

  test('propagates errors from client', async () => {
    const error = new Error('API error')
    mockClient.fetch.mockRejectedValue(error)

    await expect(
      getDocumentCount({dataset: 'production', projectId: 'test-project'}),
    ).rejects.toThrow('API error')
  })
})

describe('#exportDocuments', () => {
  test('calls fetch with correct export URL and auth header', async () => {
    const mockResponse = new Response('{"_id": "doc1"}')
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    mockClient.config.mockReturnValue({
      dataset: 'production',
      token: 'test-token',
    })
    mockClient.getUrl.mockReturnValue('https://abc123.api.sanity.io/v1/data/export/production')

    const result = await exportDocuments({dataset: 'production', projectId: 'test-project'})

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DOCUMENTS_API_VERSION,
      dataset: 'production',
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.config).toHaveBeenCalled()
    expect(mockClient.getUrl).toHaveBeenCalledWith('/data/export/production', false)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Headers is stable in modern Node.js
        headers: expect.any(Headers),
      }),
    )

    // Verify the authorization header was set
    const callArgs = mockFetch.mock.calls[0]
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Headers is stable in modern Node.js
    const headers = callArgs[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer test-token')

    expect(result).toBe(mockResponse)

    mockFetch.mockRestore()
  })

  test('does not include auth header when no token', async () => {
    const mockResponse = new Response('{"_id": "doc1"}')
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    mockClient.config.mockReturnValue({
      dataset: 'production',
      token: undefined,
    })
    mockClient.getUrl.mockReturnValue('https://abc123.api.sanity.io/v1/data/export/production')

    await exportDocuments({dataset: 'production', projectId: 'test-project'})

    const callArgs = mockFetch.mock.calls[0]
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Headers is stable in modern Node.js
    const headers = callArgs[1]?.headers as Headers
    expect(headers.get('Authorization')).toBeNull()

    mockFetch.mockRestore()
  })

  test('propagates fetch errors', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    mockClient.config.mockReturnValue({
      dataset: 'production',
      token: 'test-token',
    })
    mockClient.getUrl.mockReturnValue('https://abc123.api.sanity.io/v1/data/export/production')

    await expect(
      exportDocuments({dataset: 'production', projectId: 'test-project'}),
    ).rejects.toThrow('Network error')

    mockFetch.mockRestore()
  })
})

describe('#checkDocumentAvailability', () => {
  test('calls client.request with correct parameters', async () => {
    const mockResponse = {
      omitted: [{id: 'doc1', reason: 'existence' as const}],
    }
    mockClient.getDataUrl.mockReturnValue('/data/doc/doc1,doc2,doc3')
    mockClient.request.mockResolvedValue(mockResponse)

    const result = await checkDocumentAvailability({
      dataset: 'production',
      documentIds: ['doc1', 'doc2', 'doc3'],
      projectId: 'test-project',
    })

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DOCUMENTS_API_VERSION,
      dataset: 'production',
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.getDataUrl).toHaveBeenCalledWith('doc', 'doc1,doc2,doc3')
    expect(mockClient.request).toHaveBeenCalledWith({
      json: true,
      query: {excludeContent: 'true'},
      tag: 'documents-availability',
      uri: '/data/doc/doc1,doc2,doc3',
    })
    expect(result).toEqual(mockResponse)
  })

  test('handles empty document IDs array', async () => {
    const mockResponse = {omitted: []}
    mockClient.getDataUrl.mockReturnValue('/data/doc/')
    mockClient.request.mockResolvedValue(mockResponse)

    const result = await checkDocumentAvailability({
      dataset: 'production',
      documentIds: [],
      projectId: 'test-project',
    })

    expect(mockClient.getDataUrl).toHaveBeenCalledWith('doc', '')
    expect(result).toEqual(mockResponse)
  })

  test('returns documents omitted due to permission', async () => {
    const mockResponse = {
      omitted: [
        {id: 'doc1', reason: 'permission' as const},
        {id: 'doc2', reason: 'existence' as const},
      ],
    }
    mockClient.getDataUrl.mockReturnValue('/data/doc/doc1,doc2')
    mockClient.request.mockResolvedValue(mockResponse)

    const result = await checkDocumentAvailability({
      dataset: 'production',
      documentIds: ['doc1', 'doc2'],
      projectId: 'test-project',
    })

    expect(result.omitted).toHaveLength(2)
    expect(result.omitted[0]).toEqual({id: 'doc1', reason: 'permission'})
    expect(result.omitted[1]).toEqual({id: 'doc2', reason: 'existence'})
  })

  test('propagates errors from client', async () => {
    const error = new Error('API error')
    mockClient.getDataUrl.mockReturnValue('/data/doc/doc1')
    mockClient.request.mockRejectedValue(error)

    await expect(
      checkDocumentAvailability({
        dataset: 'production',
        documentIds: ['doc1'],
        projectId: 'test-project',
      }),
    ).rejects.toThrow('API error')
  })
})
