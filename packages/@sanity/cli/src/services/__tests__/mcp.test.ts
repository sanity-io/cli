import {afterEach, describe, expect, test, vi} from 'vitest'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...original,
    getGlobalCliClient: vi.fn().mockResolvedValue({request: mockRequest}),
  }
})

const {validateMCPToken} = await import('../mcp.js')

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

describe('validateMCPToken', () => {
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
    mockRequest.mockRejectedValue(httpError(401))

    const result = await validateMCPToken('expired-token')

    expect(result).toBe(false)
  })

  test('returns false when server responds with 403', async () => {
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
    const {getGlobalCliClient} = await import('@sanity/cli-core')
    mockRequest.mockResolvedValue({id: 'user-123'})

    await validateMCPToken('my-special-token')

    expect(getGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({
        requireUser: false,
        token: 'my-special-token',
      }),
    )
  })
})
