/**
 * @internal
 * @returns The Sanity URL for the given path, using the correct domain based on the environment
 */
export function getSanityUrl(path = '/') {
  const domain =
    process.env.SANITY_INTERNAL_ENV === 'staging'
      ? 'https://www.sanity.work'
      : 'https://www.sanity.io'
  return `${domain}${path.startsWith('/') ? path : `/${path}`}`
}
