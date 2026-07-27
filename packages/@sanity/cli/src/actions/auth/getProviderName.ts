import {type SanityOrgUser} from '@sanity/cli-core'

/**
 * Try to get a (prettier) name for a provider by ID.
 *
 * @param provider - The provider ID, e.g., 'google', 'github', 'sanity', or 'saml-<name>'.
 * @returns The display name for the provider.
 * @internal
 */
export function getProviderName(provider: string): string {
  if (provider === 'google') return 'Google'
  if (provider === 'github') return 'GitHub'
  if (provider === 'sanity') return 'Email'
  if (provider === 'sanity-token') return 'an API token'
  if (provider.startsWith('saml-')) return 'SAML'
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

/**
 * Get a human-readable identifier for a user, preferring email.
 *
 * API tokens resolve to a user with a null `email`, so falling back to the
 * name (and finally the id) keeps a literal "null" out of user-facing output.
 *
 * @param user - The user to describe.
 * @returns The user's email, or their name, or their id.
 * @internal
 */
export function getUserDisplayName(user: SanityOrgUser): string {
  return user.email || user.name || user.id
}
