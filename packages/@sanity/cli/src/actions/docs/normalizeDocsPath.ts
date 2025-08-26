/**
 * Normalizes input to a path, handling both paths and full Sanity docs URLs
 * @param input - Either a path like "/docs/studio" or full URL like "https://www.sanity.io/docs/studio"
 * @returns Normalized path starting with "/"
 *
 * @internal
 */
export function normalizeDocsPath(input: string): string {
  const sanityDocsPrefix = 'https://www.sanity.io'
  if (input.startsWith(sanityDocsPrefix)) {
    return input.replace(sanityDocsPrefix, '')
  }
  return input
}
