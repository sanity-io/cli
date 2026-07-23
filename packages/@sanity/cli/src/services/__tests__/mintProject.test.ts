import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  lookupClaimStateViaProject,
  mintUnclaimedProject,
  PROVISION_API_VERSION,
} from '../mintProject.js'

const mockFetch = vi.fn()

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

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockResolvedValue({
    json: async () => provisionResponse,
    ok: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('#mintUnclaimedProject', () => {
  test('posts display name to the provision endpoint and maps the response', async () => {
    const minted = await mintUnclaimedProject({displayName: 'My Project'})

    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.sanity.io/${PROVISION_API_VERSION}/provision`,
      {
        body: JSON.stringify({displayName: 'My Project', resourceType: 'project'}),
        headers: {'Content-Type': 'application/json'},
        method: 'POST',
      },
    )
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

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({displayName: 'Padded', resourceType: 'project'}),
      }),
    )
  })

  test('respects SANITY_API_HOST override, stripping trailing slash', async () => {
    vi.stubEnv('SANITY_API_HOST', 'https://api.sanity.example/')

    await mintUnclaimedProject({displayName: 'My Project'})

    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.sanity.example/${PROVISION_API_VERSION}/provision`,
      expect.any(Object),
    )
  })

  test.each(['', '   ', 'x'.repeat(81)])('rejects invalid display name %j', async (displayName) => {
    await expect(mintUnclaimedProject({displayName})).rejects.toThrow(
      'Display name must be 1-80 characters.',
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('throws with status and body on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'provisioning disabled',
    })

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Mint failed (HTTP 404): provisioning disabled',
    )
  })

  test('falls back to statusText when the error body is unreadable', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => {
        throw new Error('no body')
      },
    })

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Mint failed (HTTP 500): Internal Server Error',
    )
  })

  test('throws when the response has no claim token', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({...provisionResponse, claimToken: undefined}),
      ok: true,
    })

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      /did not return a claim token/,
    )
  })

  test('names every missing field instead of mapping a partial 200 response', async () => {
    // A 200 is still external input: every mapped field lands in .env or the JSON payload, so
    // a hole must fail loudly here — not crash on `data.links` or write the literal string
    // "undefined" as a credential.
    mockFetch.mockResolvedValue({
      json: async () => ({
        ...provisionResponse,
        links: undefined,
        token: '',
      }),
      ok: true,
    })

    await expect(mintUnclaimedProject({displayName: 'My Project'})).rejects.toThrow(
      'Mint response is missing claimApiUrl, claimUrl, token',
    )
  })
})

describe('#lookupClaimStateViaProject', () => {
  test('reads the org id from the project host as the robot', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({organizationId: 'oSystemUnclaimed'}),
      ok: true,
      status: 200,
    })

    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBe('claimable')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://abc123.api.sanity.io/v2026-05-04/projects/abc123',
      expect.objectContaining({headers: {Authorization: 'Bearer sk-robot'}}),
    )
  })

  test('a real organization id means the project was claimed', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({organizationId: 'ocREALORG'}),
      ok: true,
      status: 200,
    })

    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBe('claimed')
  })

  test('404 means the project was reaped', async () => {
    mockFetch.mockResolvedValue({ok: false, status: 404})
    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBe('expired')
  })

  test('401 reports the token as revoked, distinct from a fail-open network error', async () => {
    mockFetch.mockResolvedValue({ok: false, status: 401})
    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBe('revoked')
  })

  test('fails open on other HTTP errors and on network failure', async () => {
    mockFetch.mockResolvedValue({ok: false, status: 500})
    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBeUndefined()

    mockFetch.mockRejectedValue(new Error('offline'))
    await expect(lookupClaimStateViaProject('abc123', 'sk-robot')).resolves.toBeUndefined()
  })

  test('honors the SANITY_API_HOST override', async () => {
    vi.stubEnv('SANITY_API_HOST', 'http://localhost:4321')
    mockFetch.mockResolvedValue({
      json: async () => ({organizationId: 'oSystemUnclaimed'}),
      ok: true,
      status: 200,
    })

    await lookupClaimStateViaProject('abc123', 'sk-robot')

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4321/v2026-05-04/projects/abc123',
      expect.anything(),
    )
  })
})
