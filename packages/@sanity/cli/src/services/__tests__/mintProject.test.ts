import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {mintUnclaimedProject, PROVISION_API_VERSION} from '../mintProject.js'

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
})
