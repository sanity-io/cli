import {afterEach, describe, expect, test, vi} from 'vitest'

import {LoginError} from '../../../errors/LoginError.js'
import {ensureAuthenticated, validateSession} from '../ensureAuthenticated.js'

const mockGetById = vi.hoisted(() => vi.fn())
const mockGetCliToken = vi.hoisted(() => vi.fn())
const mockLogin = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getCliToken: mockGetCliToken,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      users: {
        getById: mockGetById,
      },
    }),
  }
})

vi.mock('../login/login.js', () => ({
  login: mockLogin,
}))

const mockOutput = {
  error: vi.fn() as never,
  log: vi.fn(),
  warn: vi.fn(),
}

const mockTelemetry = {} as never

/**
 * Create an error object that passes the `isHttpError()` type guard.
 * Checks for `statusCode`, `message`, and a `response` object.
 */
function createHttpError(statusCode: number, message: string): Error {
  const error = new Error(message)
  return Object.assign(error, {
    response: {
      body: {error: message, message, statusCode},
      headers: {},
      method: 'GET',
      statusCode,
      statusMessage: message,
      url: '/users/me',
    },
    responseBody: {error: message, message, statusCode},
    statusCode,
  })
}

describe('validateSession', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns user when token is valid', async () => {
    mockGetCliToken.mockResolvedValue('valid-token')
    mockGetById.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'github',
    })

    const user = await validateSession()

    expect(user).toEqual({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'github',
    })
  })

  test('returns null when no token exists', async () => {
    mockGetCliToken.mockResolvedValue(undefined)

    const user = await validateSession()

    expect(user).toBeNull()
    expect(mockGetById).not.toHaveBeenCalled()
  })

  test('returns null on 401 unauthorized', async () => {
    mockGetCliToken.mockResolvedValue('expired-token')
    mockGetById.mockRejectedValue(createHttpError(401, 'Unauthorized'))

    const user = await validateSession()

    expect(user).toBeNull()
  })

  test('returns null on 403 forbidden', async () => {
    mockGetCliToken.mockResolvedValue('some-token')
    mockGetById.mockRejectedValue(createHttpError(403, 'Forbidden'))

    const user = await validateSession()

    expect(user).toBeNull()
  })

  test('re-throws non-auth HTTP errors', async () => {
    mockGetCliToken.mockResolvedValue('valid-token')
    const serverError = createHttpError(500, 'Internal Server Error')
    mockGetById.mockRejectedValue(serverError)

    await expect(validateSession()).rejects.toThrow('Internal Server Error')
  })

  test('re-throws network errors', async () => {
    mockGetCliToken.mockResolvedValue('valid-token')
    mockGetById.mockRejectedValue(new Error('request timed out'))

    await expect(validateSession()).rejects.toThrow('request timed out')
  })
})

describe('ensureAuthenticated', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns user without login when token is valid', async () => {
    mockGetCliToken.mockResolvedValue('valid-token')
    mockGetById.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'github',
    })

    const user = await ensureAuthenticated({output: mockOutput, telemetry: mockTelemetry})

    expect(user).toEqual(expect.objectContaining({email: 'test@example.com'}))
    expect(mockLogin).not.toHaveBeenCalled()
  })

  test('triggers login when no token exists', async () => {
    mockGetCliToken.mockResolvedValueOnce(undefined).mockResolvedValue('new-token')
    mockLogin.mockResolvedValue(undefined)
    mockGetById.mockResolvedValue({
      email: 'new@example.com',
      id: 'user-456',
      name: 'New User',
      provider: 'google',
    })

    const user = await ensureAuthenticated({output: mockOutput, telemetry: mockTelemetry})

    expect(mockLogin).toHaveBeenCalledWith({output: mockOutput, telemetry: mockTelemetry})
    expect(user).toEqual(expect.objectContaining({email: 'new@example.com'}))
  })

  test('triggers login when token is expired', async () => {
    mockGetCliToken.mockResolvedValue('expired-token')
    mockGetById.mockRejectedValueOnce(createHttpError(401, 'Unauthorized')).mockResolvedValue({
      email: 'reauthed@example.com',
      id: 'user-789',
      name: 'Reauthed User',
      provider: 'github',
    })
    mockLogin.mockResolvedValue(undefined)

    const user = await ensureAuthenticated({output: mockOutput, telemetry: mockTelemetry})

    expect(mockLogin).toHaveBeenCalled()
    expect(user).toEqual(expect.objectContaining({email: 'reauthed@example.com'}))
  })

  test('throws LoginError when login fails', async () => {
    mockGetCliToken.mockResolvedValue(undefined)
    mockLogin.mockRejectedValue(new Error('No authentication providers found'))

    const result = ensureAuthenticated({output: mockOutput, telemetry: mockTelemetry})

    await expect(result).rejects.toBeInstanceOf(LoginError)
    await expect(result).rejects.toThrow('No authentication providers found')
  })

  test('re-throws network errors without triggering login', async () => {
    mockGetCliToken.mockResolvedValue('valid-token')
    mockGetById.mockRejectedValue(new Error('request timed out'))

    await expect(
      ensureAuthenticated({output: mockOutput, telemetry: mockTelemetry}),
    ).rejects.toThrow('request timed out')
    expect(mockLogin).not.toHaveBeenCalled()
  })

  test('throws LoginError when post-login user fetch returns 401', async () => {
    mockGetCliToken.mockResolvedValueOnce(undefined).mockResolvedValue('new-token')
    mockLogin.mockResolvedValue(undefined)
    mockGetById.mockRejectedValue(createHttpError(401, 'Unauthorized'))

    const result = ensureAuthenticated({output: mockOutput, telemetry: mockTelemetry})

    await expect(result).rejects.toBeInstanceOf(LoginError)
    await expect(result).rejects.toThrow('Login succeeded but failed to verify session')
  })

  test('re-throws network error from post-login user fetch without LoginError', async () => {
    mockGetCliToken.mockResolvedValueOnce(undefined).mockResolvedValue('new-token')
    mockLogin.mockResolvedValue(undefined)
    mockGetById.mockRejectedValue(new Error('request timed out'))

    const result = ensureAuthenticated({output: mockOutput, telemetry: mockTelemetry})

    await expect(result).rejects.toThrow('request timed out')
    await expect(result).rejects.not.toBeInstanceOf(LoginError)
  })
})
