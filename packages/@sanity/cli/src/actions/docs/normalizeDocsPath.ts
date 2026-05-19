/**
 * Normalizes input to a path, handling both paths and full Sanity docs URLs
 * @param input - Either a path like "/docs/studio" or full URL like "https://www.sanity.io/docs/studio"
 * @returns Normalized path starting with "/"
 *
 * @internal
 */
export function normalizeDocsPath(input: string): string {
  try {
    const url = new URL(input)
    if (url.origin === 'https://www.sanity.io') {
      return url.pathname
    }
  } catch {
    // Input is already a path or another non-URL value.
  }

  return input
}
