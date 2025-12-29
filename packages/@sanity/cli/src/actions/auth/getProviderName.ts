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
  if (provider.startsWith('saml-')) return 'SAML'
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}
