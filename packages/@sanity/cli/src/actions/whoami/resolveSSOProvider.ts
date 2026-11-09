import {subdebug} from '@sanity/cli-core'

import {getOrganizationSSOProviders} from '../../services/auth.js'
import {listOrganizations} from '../../services/organizations.js'

const debug = subdebug('whoami:sso')

const SAML_PREFIX = 'saml-'

/**
 * The SSO provider and organization a SAML user logged in through.
 *
 * @internal
 */
export interface SSOProviderInfo {
  organizationId: string
  organizationName: string
  organizationSlug: string | null
  providerId: string
  providerName: string
}

/**
 * Get the SSO provider ID from a user's `provider` value (`saml-<providerId>`).
 *
 * @param provider - The provider value from `/users/me`
 * @returns The SSO provider ID, or undefined if the user did not log in with SAML
 * @internal
 */
export function getSamlProviderId(provider: string): string | undefined {
  if (!provider.startsWith(SAML_PREFIX)) return undefined
  return provider.slice(SAML_PREFIX.length) || undefined
}

/**
 * Find the organization and SSO provider behind a `saml-<providerId>` login, by
 * looking through the SSO providers of the organizations the user belongs to.
 *
 * Best effort: returns undefined if the provider cannot be found or the lookup
 * fails, so callers can still show that the user logged in with SAML.
 *
 * @param providerId - The SSO provider ID
 * @returns The provider and organization, or undefined if it could not be resolved
 * @internal
 */
export async function resolveSSOProvider(providerId: string): Promise<SSOProviderInfo | undefined> {
  try {
    const organizations = await listOrganizations()
    for (const organization of organizations) {
      const providers = await getOrganizationSSOProviders(organization.id)
      const provider = providers.find((candidate) => candidate.id === providerId)
      if (provider) {
        return {
          organizationId: organization.id,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          providerId,
          providerName: provider.name,
        }
      }
    }
    debug('SSO provider %s not found in any organization', providerId)
  } catch (err) {
    debug('Failed to resolve SSO provider %s: %O', providerId, err)
  }
  return undefined
}
