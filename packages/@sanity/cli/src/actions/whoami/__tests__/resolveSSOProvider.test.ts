import {afterEach, describe, expect, test, vi} from 'vitest'

import {getSamlProviderId, resolveSSOProvider} from '../resolveSSOProvider.js'

const mockListOrgs = vi.hoisted(() => vi.fn())
const mockGetOrgSSOProviders = vi.hoisted(() => vi.fn())

vi.mock('../../../services/organizations.js', () => ({
  listOrganizations: mockListOrgs,
}))
vi.mock('../../../services/auth.js', () => ({
  getOrganizationSSOProviders: mockGetOrgSSOProviders,
}))

function samlProvider(id: string, name: string, organizationId: string) {
  return {
    callbackUrl: `https://api.sanity.io/v2025-09-23/auth/saml/callback/${id}`,
    disabled: false,
    id,
    loginUrl: `https://api.sanity.io/v2025-09-23/auth/saml/login/${id}`,
    name,
    organizationId,
    type: 'saml' as const,
  }
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('getSamlProviderId', () => {
  test('returns the provider id for SAML logins', () => {
    expect(getSamlProviderId('saml-abc123')).toBe('abc123')
  })

  test('returns undefined for other providers', () => {
    expect(getSamlProviderId('google')).toBeUndefined()
    expect(getSamlProviderId('sanity-token')).toBeUndefined()
    expect(getSamlProviderId('saml-')).toBeUndefined()
  })
})

describe('resolveSSOProvider', () => {
  test('finds the organization and provider for a SAML login', async () => {
    mockListOrgs.mockResolvedValue([
      {id: 'oOther', name: 'Other Org', slug: 'other'},
      {id: 'oAcme', name: 'Acme Corp', slug: 'acme-corp'},
      {id: 'oUnchecked', name: 'Unchecked', slug: 'unchecked'},
    ])
    mockGetOrgSSOProviders.mockImplementation(async (organizationId: string) => {
      if (organizationId === 'oOther') return [samlProvider('pOther', 'Other SSO', 'oOther')]
      if (organizationId === 'oAcme') return [samlProvider('pOkta', 'Okta SSO', 'oAcme')]
      return []
    })

    await expect(resolveSSOProvider('pOkta')).resolves.toEqual({
      organizationId: 'oAcme',
      organizationName: 'Acme Corp',
      organizationSlug: 'acme-corp',
      providerId: 'pOkta',
      providerName: 'Okta SSO',
    })
    // Stops looking once the provider is found
    expect(mockGetOrgSSOProviders).toHaveBeenCalledTimes(2)
  })

  test('returns undefined when no organization has the provider', async () => {
    mockListOrgs.mockResolvedValue([{id: 'oAcme', name: 'Acme Corp', slug: 'acme-corp'}])
    mockGetOrgSSOProviders.mockResolvedValue([])

    await expect(resolveSSOProvider('pMissing')).resolves.toBeUndefined()
  })

  test('returns undefined when the lookup fails', async () => {
    mockListOrgs.mockRejectedValue(new Error('Internal Server Error'))

    await expect(resolveSSOProvider('pOkta')).resolves.toBeUndefined()
    expect(mockGetOrgSSOProviders).not.toHaveBeenCalled()
  })
})
