import {afterEach, describe, expect, test, vi} from 'vitest'

import {performApiRequest} from '../api.js'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', () => ({
  getCliToken: vi.fn(),
  getGlobalCliClient: vi.fn(),
  getProjectCliClient: vi.fn(),
}))

vi.mock('@sanity/cli-core/request', () => ({
  createRequester: vi.fn().mockReturnValue(mockRequest),
}))

describe('performApiRequest', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns the final response URL from get-it', async () => {
    const responseUrl = 'https://api.sanity.io/v1/final?tag=sanity.cli.api&limit=10'
    mockRequest.mockResolvedValue({
      body: '{}',
      headers: new Headers({'content-type': 'application/json'}),
      status: 200,
      statusText: 'OK',
      url: responseUrl,
    })

    const response = await performApiRequest({
      method: 'GET',
      query: {limit: '10'},
      resolved: {
        kind: 'url',
        query: {},
        url: 'https://api.sanity.io/v1/start',
      },
      unauthenticated: true,
    })

    expect(response.url).toBe(responseUrl)
  })
})
