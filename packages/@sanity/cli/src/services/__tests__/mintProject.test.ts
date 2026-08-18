import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {mintUnclaimedProject, PROVISION_API_VERSION} from '../mintProject.js'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/request', () => ({
  createRequester: vi.fn().mockReturnValue(mockRequest),
}))

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

function jsonResponse(body: unknown, status = 200) {
  return {
    headers: {},
    status,
    text: () => JSON.stringify(body),
  }
}

beforeEach(() => {
  mockRequest.mockResolvedValue(jsonResponse(provisionResponse))
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
      url: `https://api.sanity.io/${PROVISION_API_VERSION}/provision`,
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
        url: `https://api.sanity.example/${PROVISION_API_VERSION}/provision`,
      }),
    )
  })

  test('uses the staging API host in the staging environment', async () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')

    await mintUnclaimedProject({displayName: 'My Project'})

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `https://api.sanity.work/${PROVISION_API_VERSION}/provision`,
      }),
    )
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
      headers: {},
      status: 500,
      text: () => 'sensitive upstream details',
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
      headers: {},
      status: 200,
      text: () => 'not json',
    })

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Project creation response is missing or invalid',
    )
  })
})
