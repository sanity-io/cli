import {getProjectCliClient} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {listGraphQLEndpoints} from '../graphql.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

const mockClient = {
  request: vi.fn(),
}

beforeEach(() => {
  vi.mocked(getProjectCliClient).mockResolvedValue(mockClient as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#listGraphQLEndpoints', () => {
  test('fetches GraphQL endpoints successfully', async () => {
    const result = {
      dataset: 'production',
      generation: 'gen2',
      playgroundEnabled: true,
      projectId: '123',
      tag: 'default',
    }
    mockClient.request.mockResolvedValueOnce([result])

    const endpoints = await listGraphQLEndpoints('123')

    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'GET',
      uri: '/apis/graphql',
    })
    expect(endpoints).toEqual([result])
  })
})
