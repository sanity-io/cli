import {afterEach, describe, expect, test, vi} from 'vitest'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/request', () => ({
  createRequester: vi.fn().mockReturnValue(mockRequest),
}))

// Must import after mocking so the module picks up the mock
const {MCP_SERVER_URL, validateMCPToken} = await import('../mcp.js')

describe('validateMCPToken', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns true when server responds with 406', async () => {
    mockRequest.mockResolvedValue({statusCode: 406})

    const result = await validateMCPToken('valid-token')

    expect(result).toBe(true)
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '{}',
        headers: {
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
        },
        method: 'POST',
        timeout: 2500,
        url: MCP_SERVER_URL,
      }),
    )
  })

  test('returns false when server responds with 401', async () => {
    mockRequest.mockResolvedValue({statusCode: 401})

    const result = await validateMCPToken('expired-token')

    expect(result).toBe(false)
  })

  test('returns false when server responds with 403', async () => {
    mockRequest.mockResolvedValue({statusCode: 403})

    const result = await validateMCPToken('forbidden-token')

    expect(result).toBe(false)
  })

  test('returns true on 500 server error (assumes valid)', async () => {
    mockRequest.mockResolvedValue({statusCode: 500})

    const result = await validateMCPToken('some-token')

    expect(result).toBe(true)
  })

  test('returns true on 503 server error (assumes valid)', async () => {
    mockRequest.mockResolvedValue({statusCode: 503})

    const result = await validateMCPToken('some-token')

    expect(result).toBe(true)
  })

  test('returns true on 200 response (unexpected but assumes valid)', async () => {
    mockRequest.mockResolvedValue({statusCode: 200})

    const result = await validateMCPToken('some-token')

    expect(result).toBe(true)
  })

  test('propagates network errors from the requester', async () => {
    mockRequest.mockRejectedValue(new Error('ETIMEDOUT'))

    await expect(validateMCPToken('some-token')).rejects.toThrow('ETIMEDOUT')
  })

  test('passes timeout of 2500ms in the request', async () => {
    mockRequest.mockResolvedValue({statusCode: 406})

    await validateMCPToken('any-token')

    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({timeout: 2500}))
  })
})
