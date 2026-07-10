import * as apiClientMocks from '@sanity/cli-test/mocks/cli-core/apiClient'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {validateMCPToken} from '../mcp.js'

vi.mock('@sanity/cli-core/apiClient', () => import('@sanity/cli-test/mocks/cli-core/apiClient'))

const mockIsHttpError = vi.hoisted(() => vi.fn())
vi.mock('@sanity/client', () => ({
  isHttpError: mockIsHttpError,
}))

/** Build an error object that satisfies `isHttpError()` from sanity client */
function httpError(statusCode: number) {
  const err = new Error(`HTTP ${statusCode}`)
  Object.assign(err, {
    response: {
      body: {},
      headers: {},
      method: 'GET',
      statusCode,
      statusMessage: null,
      url: 'https://api.sanity.io/v2025-12-09/users/me',
    },
    statusCode,
  })
  return err
}

const mockRequest = vi.fn()

describe('validateMCPToken', () => {
  beforeEach(() => {
    apiClientMocks.getGlobalCliClient.mockResolvedValue({request: mockRequest})
    mockIsHttpError.mockReturnValue(false)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns true when /users/me responds successfully', async () => {
    mockRequest.mockResolvedValue({id: 'user-123', name: 'Test User'})

    const result = await validateMCPToken('valid-token')

    expect(result).toBe(true)
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({timeout: 2500, uri: '/users/me'}),
    )
  })

  test('returns false when server responds with 401', async () => {
    mockIsHttpError.mockReturnValue(true)
    mockRequest.mockRejectedValue(httpError(401))

    const result = await validateMCPToken('expired-token')

    expect(result).toBe(false)
  })

  test('returns false when server responds with 403', async () => {
    mockIsHttpError.mockReturnValue(true)
    mockRequest.mockRejectedValue(httpError(403))

    const result = await validateMCPToken('forbidden-token')

    expect(result).toBe(false)
  })

  test('propagates 500 server error (caller decides)', async () => {
    mockRequest.mockRejectedValue(httpError(500))

    await expect(validateMCPToken('some-token')).rejects.toThrow('HTTP 500')
  })

  test('propagates network errors', async () => {
    mockRequest.mockRejectedValue(new Error('ETIMEDOUT'))

    await expect(validateMCPToken('some-token')).rejects.toThrow('ETIMEDOUT')
  })

  test('passes the token to getGlobalCliClient', async () => {
    mockRequest.mockResolvedValue({id: 'user-123'})

    await validateMCPToken('my-special-token')

    expect(apiClientMocks.getGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({
        requireUser: false,
        token: 'my-special-token',
      }),
    )
  })
})
