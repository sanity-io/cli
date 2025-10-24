import {getGlobalCliClient} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {deleteAspect, getMediaLibraries, MEDIA_LIBRARY_API_VERSION} from '../mediaLibraries.js'

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
                type: 'sanity.mediaLibrary.assetAspect',
              },
              query: `*[_type == $type && _id == $id]`,
            },
          },
        ],
      },
      method: 'POST',
      uri: '/media-libraries/test-library-id/mutate',
    })
    expect(result).toBe(mockResponse)
  })
})

describe('#getMediaLibraries', () => {
  test('calls client.request with correct parameters', async () => {
    const mockResponse = {data: [{id: 'myAspect'}]}
    mockClient.request.mockResolvedValue(mockResponse)

    const result = await getMediaLibraries('test-project')
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
      apiVersion: MEDIA_LIBRARY_API_VERSION,
      requireUser: true,
    })
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'GET',
      query: {projectId: 'test-project'},
      uri: '/media-libraries',
    })
    expect(result).toBe(mockResponse)
  })
})
