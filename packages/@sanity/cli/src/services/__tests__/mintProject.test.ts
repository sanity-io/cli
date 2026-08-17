import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {MINT_REQUEST_TAG, mintUnclaimedProject, PROVISION_API_VERSION} from '../mintProject.js'

const mockRequest = vi.hoisted(() => vi.fn())
const mockGetCliToken = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/request', () => ({
  createRequester: vi.fn().mockReturnValue(mockRequest),
}))

vi.mock('@sanity/cli-core/config', () => ({
  getCliToken: mockGetCliToken,
}))

const PROVISION_URL = `https://api.sanity.io/${PROVISION_API_VERSION}/provision?tag=${MINT_REQUEST_TAG}`

const provisionResponse = {
  apiHost: 'https://abc123.api.sanity.io',
  claimToken: 'claim-token',
  datasetName: 'production',
  expiresAt: '2026-08-01T00:00:00.000Z',
  links: {
    claimApiUrl: 'https://api.sanity.io/v1/provision/claim',
    claimUrl: 'https://www.sanity.io/claim/claim-token',
  },
  resourceId: 'abc123',
  resourceType: 'project',
  terms: {
    notice: 'By continuing to use this project you accept the Sanity Terms of Service.',
    url: 'https://www.sanity.io/legal/tos',
  },
  token: 'sk-robot-token',
}

function jsonResponse(body: unknown, statusCode = 200) {
  return {
    body: JSON.stringify(body),
    headers: {},
    statusCode,
  }
}

beforeEach(() => {
  mockRequest.mockResolvedValue(jsonResponse(provisionResponse))
  mockGetCliToken.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('mintUnclaimedProject', () => {
  test('posts the project name and returns the validated mint response', async () => {
    await expect(mintUnclaimedProject({displayName: 'My Project'})).resolves.toEqual({
      apiHost: provisionResponse.apiHost,
      claimApiUrl: provisionResponse.links.claimApiUrl,
      claimToken: provisionResponse.claimToken,
      claimUrl: provisionResponse.links.claimUrl,
      datasetName: provisionResponse.datasetName,
      expiresAt: provisionResponse.expiresAt,
      resourceId: provisionResponse.resourceId,
      termsNotice: provisionResponse.terms.notice,
      termsUrl: provisionResponse.terms.url,
      token: provisionResponse.token,
    })

    expect(mockRequest).toHaveBeenCalledWith({
      body: JSON.stringify({displayName: 'My Project', resourceType: 'project'}),
      headers: {'Content-Type': 'application/json'},
      method: 'POST',
      url: PROVISION_URL,
    })
  })

  test('trims the project name', async () => {
    await mintUnclaimedProject({displayName: '  My Project  '})

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: JSON.stringify({displayName: 'My Project', resourceType: 'project'}),
      }),
    )
  })

  test.each(['', '   ', 'x'.repeat(81)])('rejects invalid project name %j', async (displayName) => {
    await expect(mintUnclaimedProject({displayName})).rejects.toThrow(
      'Project name must be 1-80 characters.',
    )
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('uses SANITY_API_HOST and removes a trailing slash', async () => {
    vi.stubEnv('SANITY_API_HOST', 'https://api.sanity.example/')

    await mintUnclaimedProject({displayName: 'My Project'})

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `https://api.sanity.example/${PROVISION_API_VERSION}/provision?tag=${MINT_REQUEST_TAG}`,
      }),
    )
  })

  test('uses the staging API host in the staging environment', async () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')

    await mintUnclaimedProject({displayName: 'My Project'})

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `https://api.sanity.work/${PROVISION_API_VERSION}/provision?tag=${MINT_REQUEST_TAG}`,
      }),
    )
  })

  describe('request tag', () => {
    test('lets the smoke-test harness override the tag', async () => {
      vi.stubEnv('SANITY_CLI_MINT_TAG', 'sanity.cli.smoketest')

      await mintUnclaimedProject({displayName: 'My Project'})

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `https://api.sanity.io/${PROVISION_API_VERSION}/provision?tag=sanity.cli.smoketest`,
        }),
      )
    })

    // A dropped tag would silently make the mint unattributable, which is worse than ignoring a
    // bad override, so malformed values fall back rather than being sent or omitted.
    test.each(['not a tag', 'has/slash', 'x'.repeat(76), ''])(
      'falls back to the default tag when the override is %j',
      async (override) => {
        vi.stubEnv('SANITY_CLI_MINT_TAG', override)

        await mintUnclaimedProject({displayName: 'My Project'})

        expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({url: PROVISION_URL}))
      },
    )
  })

  describe('credentials', () => {
    test('mints anonymously when there is no stored credential', async () => {
      await mintUnclaimedProject({displayName: 'My Project'})

      expect(mockRequest).toHaveBeenCalledTimes(1)
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({headers: {'Content-Type': 'application/json'}}),
      )
    })

    test('sends the stored credential so the mint can be attributed to a user', async () => {
      mockGetCliToken.mockResolvedValue('sk-user-token')

      await mintUnclaimedProject({displayName: 'My Project'})

      expect(mockRequest).toHaveBeenCalledTimes(1)
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer sk-user-token',
            'Content-Type': 'application/json',
          },
        }),
      )
    })

    // `sanity new` is the one command that must work without an account, so a stale credential
    // can never be what stops it.
    test.each([401, 403])(
      'retries anonymously when the credential is rejected (%d)',
      async (statusCode) => {
        mockGetCliToken.mockResolvedValue('sk-stale-token')
        mockRequest
          .mockResolvedValueOnce(jsonResponse({}, statusCode))
          .mockResolvedValueOnce(jsonResponse(provisionResponse))

        await expect(mintUnclaimedProject({displayName: 'My Project'})).resolves.toMatchObject({
          resourceId: provisionResponse.resourceId,
        })

        expect(mockRequest).toHaveBeenCalledTimes(2)
        expect(mockRequest).toHaveBeenLastCalledWith(
          expect.objectContaining({headers: {'Content-Type': 'application/json'}}),
        )
      },
    )

    test('does not retry an anonymous mint that was rejected', async () => {
      mockRequest.mockResolvedValue(jsonResponse({}, 401))

      await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
        'Project creation failed (HTTP 401). Try again later.',
      )
      expect(mockRequest).toHaveBeenCalledTimes(1)
    })

    test('mints anonymously when the stored credential cannot be read', async () => {
      mockGetCliToken.mockRejectedValue(new Error('config is unreadable'))

      await expect(mintUnclaimedProject({displayName: 'My Project'})).resolves.toMatchObject({
        resourceId: provisionResponse.resourceId,
      })
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({headers: {'Content-Type': 'application/json'}}),
      )
    })
  })

  test('accepts an already-parsed response body', async () => {
    mockRequest.mockResolvedValue({
      body: provisionResponse,
      headers: {},
      statusCode: 200,
    })

    await expect(mintUnclaimedProject({displayName: 'My Project'})).resolves.toMatchObject({
      resourceId: provisionResponse.resourceId,
    })
  })

  // The terms notice has to reach the user even when the API predates it, so it falls back to
  // the bundled copy rather than joining the required-field check.
  test.each([
    ['omits terms', {}],
    ['sends terms that are not an object', {terms: 'nope'}],
    ['sends empty terms strings', {terms: {notice: '', url: ''}}],
  ])('falls back to the bundled terms of service when the response %s', async (_, overrides) => {
    mockRequest.mockResolvedValue(
      jsonResponse({...provisionResponse, terms: undefined, ...overrides}),
    )

    await expect(mintUnclaimedProject({displayName: 'My Project'})).resolves.toMatchObject({
      termsNotice: 'By continuing to use this project you accept the Sanity Terms of Service.',
      termsUrl: 'https://www.sanity.io/legal/tos',
    })
  })

  test('reports when minting is unavailable', async () => {
    mockRequest.mockResolvedValue(jsonResponse({}, 404))

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Creating projects without an account is currently unavailable.',
    )
  })

  test('reports rate limiting without promising a retry time', async () => {
    mockRequest.mockResolvedValue(jsonResponse({}, 429))

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Project creation rate limit reached for this machine. Try again later.',
    )
  })

  test('reports other service failures without including the response body', async () => {
    mockRequest.mockResolvedValue({
      body: 'sensitive upstream details',
      headers: {},
      statusCode: 500,
    })

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Project creation failed (HTTP 500). Try again later.',
    )
  })

  test('rejects malformed successful responses', async () => {
    mockRequest.mockResolvedValue(
      jsonResponse({
        ...provisionResponse,
        links: undefined,
        resourceType: 'dataset',
        token: '',
      }),
    )

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Project creation response is missing or invalid: claimApiUrl, claimUrl, token, resourceType',
    )
  })

  test('rejects a non-JSON successful response', async () => {
    mockRequest.mockResolvedValue({
      body: 'not json',
      headers: {},
      statusCode: 200,
    })

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Project creation response is missing or invalid',
    )
  })
})
