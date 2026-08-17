import {afterEach, describe, expect, test, vi} from 'vitest'

import {getGlobalCliClient, getProjectCliClient} from '../apiClient.js'
import {runWithCliExecutionContext} from '../executionContext.js'

const mockCreateClient = vi.hoisted(() => vi.fn())
const mockGetCliToken = vi.hoisted(() => vi.fn())
const mockCreateNodeFetch = vi.hoisted(() => vi.fn())

// Keep the real exports (enrichAuthError depends on the real isHttpError).
vi.mock('@sanity/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/client')>()),
  createClient: mockCreateClient,
}))

vi.mock('get-it/node', () => ({
  createNodeFetch: mockCreateNodeFetch,
}))

vi.mock('../config/cli/cliUserConfig.js', () => ({
  getCliToken: mockGetCliToken,
}))

function unauthorizedError(): Error {
  return Object.assign(new Error('Unauthorized - Session not found'), {
    response: {
      body: {},
      headers: {},
      method: 'GET',
      statusCode: 401,
      url: 'https://api.sanity.io/v1/users/me',
    },
    statusCode: 401,
  })
}

describe('getGlobalCliClient', () => {
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

  test('invocation production environment overrides process staging environment', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')

    await runWithCliExecutionContext({sanityEnv: 'production'}, () =>
      getGlobalCliClient({apiVersion: '2021-06-07'}),
    )

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.not.objectContaining({
        apiHost: expect.anything(),
      }),
    )
  })

  test('does not replace the client transport outside execution contexts', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')

    await getGlobalCliClient({apiVersion: '2021-06-07'})

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.not.objectContaining({resolveFetch: expect.anything()}),
    )
  })

  test('injects an isolated fetch resolver inside an execution context', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')

    await runWithCliExecutionContext({}, () => getGlobalCliClient({apiVersion: '2021-06-07'}))

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({resolveFetch: expect.any(Function)}),
    )
  })

  test('isolated fetch strips the lineage header from the embedding process', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')
    const baseFetch = vi.fn().mockResolvedValue({ok: true})
    mockCreateNodeFetch.mockReturnValue(baseFetch)

    await runWithCliExecutionContext({}, () => getGlobalCliClient({apiVersion: '2021-06-07'}))

    const {resolveFetch} = mockCreateClient.mock.calls[0][0]
    const isolatedFetch = resolveFetch()
    await isolatedFetch('https://api.sanity.io/v1/users/me', {
      headers: {'x-other': 'kept', 'x-sanity-lineage': 'host-lineage'},
    })

    expect(baseFetch).toHaveBeenCalledOnce()
    const [url, init] = baseFetch.mock.calls[0]
    expect(url).toBe('https://api.sanity.io/v1/users/me')
    expect(new Headers(init.headers).has('x-sanity-lineage')).toBe(false)
    expect(new Headers(init.headers).get('x-other')).toBe('kept')
  })

  test('isolated fetch uses the context fetch when the host supplies one', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')
    const contextFetch = vi.fn().mockResolvedValue({ok: true})

    await runWithCliExecutionContext({fetch: contextFetch}, () =>
      getGlobalCliClient({apiVersion: '2021-06-07'}),
    )

    const {resolveFetch} = mockCreateClient.mock.calls[0][0]
    const isolatedFetch = resolveFetch()
    await isolatedFetch('https://api.sanity.io/v1/users/me', {
      headers: {'x-sanity-lineage': 'host-lineage'},
    })

    expect(mockCreateNodeFetch).not.toHaveBeenCalled()
    expect(contextFetch).toHaveBeenCalledOnce()
    const [, init] = contextFetch.mock.calls[0]
    expect(new Headers(init.headers).has('x-sanity-lineage')).toBe(false)
  })

  test('explicit client apiHost overrides invocation environment', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')

    await runWithCliExecutionContext({sanityEnv: 'staging'}, () =>
      getGlobalCliClient({
        apiHost: 'https://api.sanity.io',
        apiVersion: '2021-06-07',
      }),
    )

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        apiHost: 'https://api.sanity.io',
      }),
    )
  })

  test('401 rejections from client methods carry the login hint', async () => {
    mockGetCliToken.mockResolvedValue('stored-token')
    mockCreateClient.mockReturnValue({
      request: vi.fn().mockRejectedValue(unauthorizedError()),
      withConfig: vi.fn(),
    })

    const client = await getGlobalCliClient({apiVersion: '2021-06-07'})

    await expect(client.request({url: '/users/me'})).rejects.toMatchObject({
      message: expect.stringContaining('sanity login'),
    })
  })

  test('401 rejections from sub-clients carry the login hint', async () => {
    mockGetCliToken.mockResolvedValue('stored-token')
    mockCreateClient.mockReturnValue({
      datasets: {list: vi.fn().mockRejectedValue(unauthorizedError())},
      request: vi.fn(),
      withConfig: vi.fn(),
    })

    const client = await getGlobalCliClient({apiVersion: '2021-06-07'})

    await expect(client.datasets.list()).rejects.toMatchObject({
      message: expect.stringContaining('sanity login'),
    })
  })

  test('clients derived via withConfig keep the 401 login hint', async () => {
    mockGetCliToken.mockResolvedValue('stored-token')
    const derived = {
      request: vi.fn().mockRejectedValue(unauthorizedError()),
      withConfig: vi.fn(),
    }
    mockCreateClient.mockReturnValue({
      request: vi.fn(),
      withConfig: vi.fn().mockReturnValue(derived),
    })

    const client = await getGlobalCliClient({apiVersion: '2021-06-07'})

    await expect(client.withConfig({dataset: 'other'}).request({url: '/x'})).rejects.toMatchObject({
      message: expect.stringContaining('sanity login'),
    })
  })

  test('non-401 rejections pass through unchanged', async () => {
    mockGetCliToken.mockResolvedValue('stored-token')
    const notFound = Object.assign(new Error('Not Found'), {
      response: {
        body: {},
        headers: {},
        method: 'GET',
        statusCode: 404,
        url: 'https://api.sanity.io/v1/doc/x',
      },
      statusCode: 404,
    })
    mockCreateClient.mockReturnValue({
      request: vi.fn().mockRejectedValue(notFound),
      withConfig: vi.fn(),
    })

    const client = await getGlobalCliClient({apiVersion: '2021-06-07'})

    await expect(client.request({url: '/doc/x'})).rejects.toMatchObject({
      message: 'Not Found',
    })
  })
})

describe('getProjectCliClient', () => {
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

  test('invocation staging environment overrides process production environment', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')
    vi.stubEnv('SANITY_INTERNAL_ENV', 'production')

    await runWithCliExecutionContext({sanityEnv: 'staging'}, () =>
      getProjectCliClient({
        apiVersion: '2021-06-07',
        projectId: 'test-project',
      }),
    )

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        apiHost: 'https://api.sanity.work',
      }),
    )
  })

  test('injects an isolated fetch resolver inside an execution context', async () => {
    mockCreateClient.mockResolvedValue({})
    mockGetCliToken.mockResolvedValue('stored-token')

    await runWithCliExecutionContext({}, () =>
      getProjectCliClient({apiVersion: '2021-06-07', projectId: 'test-project'}),
    )

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({resolveFetch: expect.any(Function)}),
    )
  })
})
