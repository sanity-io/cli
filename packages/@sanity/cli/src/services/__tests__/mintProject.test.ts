import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  lookupClaimState,
  lookupClaimStateViaProject,
  mintUnclaimedProject,
  PROVISION_API_VERSION,
} from '../mintProject.js'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/request', () => ({
  createRequester: vi.fn().mockReturnValue(mockRequest),
}))

const provisionResponse = {
  apiHost: 'https://abc123.api.sanity.io',
  claimToken: 'claim-token',
  datasetName: 'production',
  expiresAt: '2026-07-18T00:00:00.000Z',
  links: {
    claimApiUrl: 'https://api.sanity.io/v1/provision/claim',
    claimUrl: 'https://www.sanity.io/claim/some-token',
  },
  resourceId: 'abc123',
  resourceType: 'project',
  token: 'sk-robot-token',
}

const jsonResponse = (body: unknown, statusCode = 200) => ({
  body: JSON.stringify(body),
  headers: {},
  statusCode,
})

beforeEach(() => {
  mockRequest.mockResolvedValue(jsonResponse(provisionResponse))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('#mintUnclaimedProject', () => {
  test('posts display name to the provision endpoint and maps the response', async () => {
    const minted = await mintUnclaimedProject({displayName: 'My Project'})

    expect(mockRequest).toHaveBeenCalledWith({
      body: JSON.stringify({displayName: 'My Project', resourceType: 'project'}),
      headers: {'Content-Type': 'application/json'},
      method: 'POST',
      url: `https://api.sanity.io/${PROVISION_API_VERSION}/provision`,
    })
    expect(minted).toEqual({
      apiHost: provisionResponse.apiHost,
      claimApiUrl: provisionResponse.links.claimApiUrl,
      claimToken: provisionResponse.claimToken,
      claimUrl: provisionResponse.links.claimUrl,
      datasetName: provisionResponse.datasetName,
      expiresAt: provisionResponse.expiresAt,
      resourceId: provisionResponse.resourceId,
      token: provisionResponse.token,
    })
  })

  test('trims the display name', async () => {
    await mintUnclaimedProject({displayName: '  Padded  '})

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: JSON.stringify({displayName: 'Padded', resourceType: 'project'}),
      }),
    )
  })

  test('respects SANITY_API_HOST override, stripping trailing slash', async () => {
    vi.stubEnv('SANITY_API_HOST', 'https://api.sanity.example/')

    await mintUnclaimedProject({displayName: 'My Project'})

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `https://api.sanity.example/${PROVISION_API_VERSION}/provision`,
      }),
    )
  })

  test.each(['', '   ', 'x'.repeat(81)])('rejects invalid display name %j', async (displayName) => {
    await expect(mintUnclaimedProject({displayName})).rejects.toThrow(
      'Display name must be 1-80 characters.',
    )
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('a 404 means minting is disabled, not a malfunction', async () => {
    mockRequest.mockResolvedValue({body: '', headers: {}, statusCode: 404})

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Minting new projects is currently disabled. Try again later, or run `sanity login` and `sanity init` to create a project.',
    )
  })

  test('a 429 reports the rate limit in plain language', async () => {
    mockRequest.mockResolvedValue({body: '', headers: {}, statusCode: 429})

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Mint rate limit reached for this machine. Try again in an hour.',
    )
  })

  test('throws with status and body on other HTTP errors', async () => {
    mockRequest.mockResolvedValue({body: 'server exploded', headers: {}, statusCode: 500})

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Mint failed (HTTP 500): server exploded',
    )
  })

  test('falls back to the status message when the error body is empty', async () => {
    mockRequest.mockResolvedValue({
      body: '',
      headers: {},
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Mint failed (HTTP 500): Internal Server Error',
    )
  })

  test('throws when the response has no claim token', async () => {
    mockRequest.mockResolvedValue(jsonResponse({...provisionResponse, claimToken: undefined}))

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      /did not include a claim token/,
    )
  })

  test('names every missing field instead of mapping a partial 200 response', async () => {
    // A 200 is still external input: every mapped field lands in .env or the JSON payload, so
    // a hole must fail loudly here — not crash on `data.links` or write the literal string
    // "undefined" as a credential.
    mockRequest.mockResolvedValue(
      jsonResponse({
        ...provisionResponse,
        links: undefined,
        token: '',
      }),
    )

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Mint response is missing claimApiUrl, claimUrl, token',
    )
  })
})

describe('#lookupClaimState', () => {
  test('reads state from the provision lookup with a 500ms default timeout', async () => {
    mockRequest.mockResolvedValue(
      jsonResponse({expiresAt: '2026-07-18T00:00:00.000Z', state: 'claimable'}),
    )

    await expect(lookupClaimState('claim-token')).resolves.toEqual({
      expiresAt: '2026-07-18T00:00:00.000Z',
      state: 'claimable',
    })
    expect(mockRequest).toHaveBeenCalledWith({
      timeout: 500,
      url: `https://api.sanity.io/${PROVISION_API_VERSION}/provision/claim-token/lookup`,
    })
  })

  test('fails open on HTTP errors, network failure, and unknown states', async () => {
    mockRequest.mockResolvedValue({body: '', headers: {}, statusCode: 500})
    await expect(lookupClaimState('claim-token')).resolves.toBeUndefined()

    mockRequest.mockRejectedValue(new Error('offline'))
    await expect(lookupClaimState('claim-token')).resolves.toBeUndefined()

    mockRequest.mockResolvedValue(jsonResponse({state: 'garbage'}))
    await expect(lookupClaimState('claim-token')).resolves.toBeUndefined()
  })
})

describe('#lookupClaimStateViaProject', () => {
  test('reads the org id from the project host as the robot, with a 500ms default timeout', async () => {
    mockRequest.mockResolvedValue(jsonResponse({organizationId: 'oSystemUnclaimed'}))

    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBe('claimable')
    expect(mockRequest).toHaveBeenCalledWith({
      headers: {Authorization: 'Bearer sk-robot'},
      timeout: 500,
      url: 'https://abc123.api.sanity.io/v2026-05-04/projects/abc123',
    })
  })

  test('honors an explicit timeout override', async () => {
    mockRequest.mockResolvedValue(jsonResponse({organizationId: 'oSystemUnclaimed'}))

    await lookupClaimStateViaProject('abc123', 'sk-robot', {timeoutMs: 3000})

    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({timeout: 3000}))
  })

  test('a real organization id means the project was claimed', async () => {
    mockRequest.mockResolvedValue(jsonResponse({organizationId: 'ocREALORG'}))

    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBe('claimed')
  })

  test('404 means the project was reaped', async () => {
    mockRequest.mockResolvedValue({body: '', headers: {}, statusCode: 404})
    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBe('expired')
  })

  test('401 reports the token as revoked, distinct from a fail-open network error', async () => {
    mockRequest.mockResolvedValue({body: '', headers: {}, statusCode: 401})
    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBe('revoked')
  })

  test('fails open on other HTTP errors and on network failure', async () => {
    mockRequest.mockResolvedValue({body: '', headers: {}, statusCode: 500})
    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBeUndefined()

    mockRequest.mockRejectedValue(new Error('offline'))
    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBeUndefined()
  })

  test('honors the SANITY_API_HOST override', async () => {
    vi.stubEnv('SANITY_API_HOST', 'http://localhost:4321')
    mockRequest.mockResolvedValue(jsonResponse({organizationId: 'oSystemUnclaimed'}))

    await lookupClaimStateViaProject('abc123', 'sk-robot')

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({url: 'http://localhost:4321/v2026-05-04/projects/abc123'}),
    )
  })
})
