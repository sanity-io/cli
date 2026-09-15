import {getGlobalCliClient} from '@sanity/cli-core'
import {MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME} from '@sanity/types'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  deleteAspect,
  getMediaLibraries,
  ingestMediaLibraryAssetFromUrl,
  MEDIA_LIBRARY_API_VERSION,
} from '../mediaLibraries.js'

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

beforeEach(() => {
  mockGetGlobalCliClient.mockResolvedValue(mockClient as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#deleteAspect', () => {
  test('calls client.request with correct parameters', async () => {
    const mockResponse = {results: [{id: 'myAspect'}]}
    mockClient.request.mockResolvedValue(mockResponse)

    const result = await deleteAspect({
      aspectName: 'myAspect',
      mediaLibraryId: 'test-library-id',
      projectId: 'test-project',
    })

    expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      requireUser: true,
    })

    expect(mockClient.request).toHaveBeenCalledWith({
      body: {
        mutations: [
          {
            delete: {
              params: {
                id: 'myAspect',
                type: MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME,
              },
              query: `*[_type == $type && _id == $id]`,
            },
          },
        ],
      },
      method: 'POST',
      url: '/media-libraries/test-library-id/mutate',
    })
    expect(result).toBe(mockResponse)
  })
})

describe('#getMediaLibraries', () => {
  test('calls client.request with correct parameters', async () => {
    const mockResponse = {data: [{id: 'myAspect', status: 'active'}]}
    mockClient.request.mockResolvedValue(mockResponse)

    const result = await getMediaLibraries('test-project')
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      requireUser: true,
    })
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'GET',
      query: {projectId: 'test-project'},
      url: '/media-libraries',
    })
    expect(result).toStrictEqual(mockResponse.data)
  })
})

describe('#ingestMediaLibraryAssetFromUrl', () => {
  const mockResponse = {
    asset: {_id: 'asset-1', _type: 'sanity.asset'},
    assetInstance: {_id: 'image-1'},
  }

  test('posts the url to the library from-url endpoint', async () => {
    mockClient.request.mockResolvedValue(mockResponse)

    const result = await ingestMediaLibraryAssetFromUrl({
      mediaLibraryId: 'test-library-id',
      url: 'https://example.com/hero.png',
    })

    expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      requireUser: true,
    })
    expect(mockClient.request).toHaveBeenCalledWith({
      body: {url: 'https://example.com/hero.png'},
      method: 'POST',
      signal: undefined,
      tag: 'asset.ingest.from-url',
      timeout: 370_000,
      url: '/media-libraries/test-library-id/from-url',
    })
    expect(result).toBe(mockResponse)
  })

  test('includes filename and aspects when provided', async () => {
    mockClient.request.mockResolvedValue(mockResponse)

    await ingestMediaLibraryAssetFromUrl({
      aspects: {department: 'Brand'},
      filename: 'hero.png',
      mediaLibraryId: 'test-library-id',
      url: 'https://example.com/asset',
    })

    expect(mockClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          aspects: {department: 'Brand'},
          filename: 'hero.png',
          url: 'https://example.com/asset',
        },
      }),
    )
  })

  test('omits empty aspects rather than sending an empty object', async () => {
    mockClient.request.mockResolvedValue(mockResponse)

    await ingestMediaLibraryAssetFromUrl({
      mediaLibraryId: 'test-library-id',
      url: 'https://example.com/asset',
    })

    expect(mockClient.request).toHaveBeenCalledWith(
      expect.objectContaining({body: {url: 'https://example.com/asset'}}),
    )
  })

  test('forwards the abort signal to the request', async () => {
    mockClient.request.mockResolvedValue(mockResponse)
    const controller = new AbortController()

    await ingestMediaLibraryAssetFromUrl({
      mediaLibraryId: 'test-library-id',
      signal: controller.signal,
      url: 'https://example.com/asset',
    })

    expect(mockClient.request).toHaveBeenCalledWith(
      expect.objectContaining({signal: controller.signal}),
    )
  })

  test('does not issue a request when already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('SIGINT'))

    await expect(
      ingestMediaLibraryAssetFromUrl({
        mediaLibraryId: 'test-library-id',
        signal: controller.signal,
        url: 'https://example.com/asset',
      }),
    ).rejects.toThrow('SIGINT')

    expect(mockClient.request).not.toHaveBeenCalled()
  })
})
