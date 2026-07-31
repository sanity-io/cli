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
