/**
 * @internal
 * @returns The domain for sanity depending on the environment
 */
export function getSanityUrl() {
  return process.env.SANITY_INTERNAL_ENV === 'staging'
    ? 'https://www.sanity.work'
    : 'https://www.sanity.io'
}
