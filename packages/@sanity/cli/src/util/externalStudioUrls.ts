export function validateUrl(url: string): string | true {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'URL must start with http:// or https://'
    }
    return true
  } catch {
    return 'Please enter a valid URL'
  }
}

export function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '')
}
