/**
 * Validates that the given string is a valid http or https URL.
 * Returns `true` if valid, or an error message string if invalid.
 */
export function validateUrl(url: string): string | true {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'URL must use http or https protocol'
    }
    return true
  } catch {
    return 'Invalid URL. Please enter a valid http or https URL'
  }
}

/**
 * Normalizes a URL by removing trailing slashes.
 */
export function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '')
}
