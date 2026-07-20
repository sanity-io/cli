import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getGlobalCliClient, getProjectCliClient} from '../apiClient.js'

const mockCreateClient = vi.hoisted(() => vi.fn())
const mockRequesterClone = vi.hoisted(() => vi.fn())
const mockRequesterUse = vi.hoisted(() => vi.fn())
const mockGetCliToken = vi.hoisted(() => vi.fn())
const mockGenerateHelpUrl = vi.hoisted(() => vi.fn())
const mockIsHttpError = vi.hoisted(() => vi.fn())

vi.mock('@sanity/client', () => ({
  createClient: mockCreateClient,
  isHttpError: mockIsHttpError,
  requester: {
    clone: mockRequesterClone,
  },
}))

vi.mock('../config/cli/cliUserConfig.js', () => ({
  getCliToken: mockGetCliToken,
}))

vi.mock('../util/generateHelpUrl.js', () => ({
  generateHelpUrl: mockGenerateHelpUrl,
}))

describe('getGlobalCliClient', () => {
  beforeEach(() => {
    const mockRequester = {use: mockRequesterUse}
    mockRequesterClone.mockReturnValueOnce(mockRequester)
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('uses provided token when supplied', async () => {
    mockCreateClient.mockResolvedValue({})

    await getGlobalCliClient({
      apiVersion: '2021-06-07',
      token: 'provided-token',
    })

    expect(mockGetCliToken).not.toHaveBeenCalled()
    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'provided-token',
      }),
    )
  })

  test('retrieves token from getCliToken when not provided', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')

    await getGlobalCliClient({
      apiVersion: '2021-06-07',
    })

    expect(mockGetCliToken).toHaveBeenCalled()
    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'stored-token',
      }),
    )
  })

  test('throws error when requireUser=true and no token available', async () => {
    mockGetCliToken.mockResolvedValue(undefined)

    await expect(
      getGlobalCliClient({
        apiVersion: '2021-06-07',
        requireUser: true,
      }),
    ).rejects.toThrow('You must login first - run "sanity login"')

    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  test('creates client with undefined token when requireUser=false and no token available', async () => {
    mockGetCliToken.mockResolvedValue(undefined)
    mockCreateClient.mockResolvedValue({})

    await getGlobalCliClient({apiVersion: '2021-06-07', requireUser: false})

    expect(mockCreateClient).toHaveBeenCalledWith(expect.objectContaining({token: undefined}))
  })

  test('creates client without token when unauthenticated is passed', async () => {
    mockGetCliToken.mockResolvedValue('stored-token')
    mockCreateClient.mockResolvedValue({})

    await getGlobalCliClient({apiVersion: '2021-06-07', unauthenticated: true})

    expect(mockGetCliToken).not.toHaveBeenCalled()
    expect(mockCreateClient).toHaveBeenCalledWith(expect.objectContaining({token: undefined}))
  })

  test('creates client with token when unauthenticated and token are passed', async () => {
    mockCreateClient.mockResolvedValue({})

    await getGlobalCliClient({
      apiVersion: '2021-06-07',
      token: 'provided-token',
      unauthenticated: true,
    })

    expect(mockGetCliToken).not.toHaveBeenCalled()
    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({token: 'provided-token'}),
    )
  })

  test('throws error when unauthenticated is passed with requireUser', async () => {
    await expect(
      getGlobalCliClient({
        apiVersion: '2021-06-07',
        requireUser: true,
        unauthenticated: true,
      }),
    ).rejects.toThrow('You must login first - run "sanity login"')

    expect(mockGetCliToken).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  test('uses staging apiHost when SANITY_INTERNAL_ENV=staging', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')

    await getGlobalCliClient({
      apiVersion: '2021-06-07',
    })

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        apiHost: 'https://api.sanity.work',
      }),
    )
  })
})

describe('getProjectCliClient', () => {
  beforeEach(() => {
    const mockRequester = {use: mockRequesterUse}
    mockRequesterClone.mockReturnValueOnce(mockRequester)
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('sets useProjectHostname=true instead of false', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')

    await getProjectCliClient({
      apiVersion: '2021-06-07',
      projectId: 'test-project',
    })

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        useProjectHostname: true,
      }),
    )
  })

  test('accepts projectId and dataset in config', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')

    await getProjectCliClient({
      apiVersion: '2021-06-07',
      dataset: 'production',
      projectId: 'test-project',
    })

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: 'production',
        projectId: 'test-project',
      }),
    )
  })

  test('throws error when requireUser=true and no token', async () => {
    mockGetCliToken.mockResolvedValue(undefined)

    await expect(
      getProjectCliClient({
        apiVersion: '2021-06-07',
        projectId: 'test-project',
        requireUser: true,
      }),
    ).rejects.toThrow('You must login first - run "sanity login"')

    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  test('creates client with undefined token when requireUser=false and no token available', async () => {
    mockGetCliToken.mockResolvedValue(undefined)
    mockCreateClient.mockResolvedValue({})

    await getProjectCliClient({
      apiVersion: '2021-06-07',
      projectId: 'test-project',
      requireUser: false,
    })

    expect(mockCreateClient).toHaveBeenCalledWith(expect.objectContaining({token: undefined}))
  })

  test('uses staging apiHost when SANITY_INTERNAL_ENV=staging', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')

    await getProjectCliClient({
      apiVersion: '2021-06-07',
      projectId: 'test-project',
    })

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        apiHost: 'https://api.sanity.work',
      }),
    )
  })

  test('uses default apiHost when SANITY_INTERNAL_ENV=production', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')
    vi.stubEnv('SANITY_INTERNAL_ENV', 'production')

    await getProjectCliClient({
      apiVersion: '2021-06-07',
      projectId: 'test-project',
    })

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.not.objectContaining({
        apiHost: expect.anything(),
      }),
    )
  })
})

describe('authErrors middleware', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('enhances 401 errors with helpful login message', async () => {
    let onErrorHandler: ((err: Error | null) => Error | null) | undefined
    const mockRequester = {
      use: mockRequesterUse.mockImplementation((middleware: {onError?: typeof onErrorHandler}) => {
        onErrorHandler = middleware.onError
      }),
    }
    mockRequesterClone.mockReturnValue(mockRequester)
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')
    mockGenerateHelpUrl.mockReturnValue('https://help.sanity.io/cli-errors')

    await getGlobalCliClient({apiVersion: '2021-06-07'})

    expect(onErrorHandler).toBeDefined()

    const error = new Error('Unauthorized') as Error & {
      response: {body: Record<string, never>}
      statusCode: number
    }
    error.response = {body: {}}
    error.statusCode = 401

    mockIsHttpError.mockReturnValue(true)

    const result = onErrorHandler!(error)

    expect(result).toBe(error)
    expect(result).not.toBeNull()
    expect(result!.message).toContain('Unauthorized')
    expect(result!.message).toContain('You may need to login again with')
    expect(result!.message).toContain('sanity login')
    expect(result!.message).toContain('https://help.sanity.io/cli-errors')
    expect(mockGenerateHelpUrl).toHaveBeenCalledWith('cli-errors')
  })

  test('links to project members for projectUserNotFoundError', async () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'production')

    let onErrorHandler: ((err: Error | null) => Error | null) | undefined
    const mockRequester = {
      use: mockRequesterUse.mockImplementation((middleware: {onError?: typeof onErrorHandler}) => {
        onErrorHandler = middleware.onError
      }),
    }
    mockRequesterClone.mockReturnValue(mockRequester)
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')

    await getProjectCliClient({
      apiVersion: '2021-06-07',
      projectId: 'test-project',
    })

    expect(onErrorHandler).toBeDefined()

    const error = new Error('Project user not found') as Error & {
      response: {
        body: {error: {type: string}}
      }
      statusCode: number
    }
    error.response = {
      body: {
        error: {type: 'projectUserNotFoundError'},
      },
    }
    error.statusCode = 401

    mockIsHttpError.mockReturnValue(true)

    const result = onErrorHandler!(error)

    expect(result).toBe(error)
    expect(result?.message).toBe(
      'Project user not found. Add this account as a project member: https://www.sanity.io/manage/project/test-project/members.',
    )
    expect(result?.message).not.toContain('sanity login')
  })

  test('returns non-401 HTTP errors unchanged', async () => {
    let onErrorHandler: ((err: Error | null) => Error | null) | undefined
    const mockRequester = {
      use: mockRequesterUse.mockImplementation((middleware: {onError?: typeof onErrorHandler}) => {
        onErrorHandler = middleware.onError
      }),
    }
    mockRequesterClone.mockReturnValue(mockRequester)
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')

    await getGlobalCliClient({apiVersion: '2021-06-07'})

    const error = new Error('Not Found') as Error & {
      response: {body: Record<string, never>}
      statusCode: number
    }
    error.response = {body: {}}
    error.statusCode = 404

    mockIsHttpError.mockReturnValue(true)

    const result = onErrorHandler!(error)

    expect(result).toBe(error)
    expect(result).not.toBeNull()
    expect(result!.message).toBe('Not Found')
    expect(result!.message).not.toContain('login')
  })

  test('returns non-HTTP errors unchanged', async () => {
    let onErrorHandler: ((err: Error | null) => Error | null) | undefined
    const mockRequester = {
      use: mockRequesterUse.mockImplementation((middleware: {onError?: typeof onErrorHandler}) => {
        onErrorHandler = middleware.onError
      }),
    }
    mockRequesterClone.mockReturnValue(mockRequester)
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')

    await getGlobalCliClient({apiVersion: '2021-06-07'})

    const error = new Error('Generic error')

    mockIsHttpError.mockReturnValue(false)

    const result = onErrorHandler!(error)

    expect(result).toBe(error)
    expect(result).not.toBeNull()
    expect(result!.message).toBe('Generic error')
  })
})
