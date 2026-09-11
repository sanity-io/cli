const MAX_URL_LENGTH = 2048
const MAX_FILENAME_LENGTH = 255

/**
 * Check a URL that Sanity will fetch an asset from.
 *
 * Sanity fetches the source itself, over the public internet and without
 * credentials, so a URL it cannot act on is worth rejecting here rather than
 * spending a request to have it come back as an opaque server error.
 *
 * Embedded credentials are rejected rather than stripped: they would travel to
 * Sanity and be recorded wherever the request is, and a presigned URL is the
 * supported way to reach a source that needs authentication.
 *
 * @returns The problem with the URL, or `undefined` when it is usable.
 *
 * @internal
 */
export function getIngestUrlError(url: string): string | undefined {
  if (url.length > MAX_URL_LENGTH) {
    return `The asset URL must be ${MAX_URL_LENGTH} characters or fewer, but is ${url.length}. Shorten the URL, then try again.`
  }

  if (!URL.canParse(url)) {
    return `"${url}" is not a valid URL. Pass a full URL, such as https://example.com/hero.png.`
  }

  const {password, protocol, username} = new URL(url)

  if (protocol !== 'http:' && protocol !== 'https:') {
    return `The asset URL must use http or https, not "${protocol}". Sanity fetches the asset over the public internet.`
  }

  if (username || password) {
    return 'The asset URL must not contain a username or password. Use a presigned URL when the source needs authentication.'
  }

  return undefined
}

/**
 * Check a `--filename` value against what an asset document can store.
 *
 * Only validates a filename the user supplied. A filename derived from a local
 * path is already a single path segment, and on POSIX it may legitimately
 * contain the backslash rejected here.
 *
 * @returns The problem with the filename, or `undefined` when it is usable.
 *
 * @internal
 */
export function getAssetFilenameError(filename: string): string | undefined {
  if (filename.length === 0) {
    return '--filename must not be empty. Pass a filename, or omit the flag to let Sanity derive one.'
  }

  if (filename.length > MAX_FILENAME_LENGTH) {
    return `--filename must be ${MAX_FILENAME_LENGTH} characters or fewer, but is ${filename.length}. Shorten the filename, then try again.`
  }

  if (/[/\\\0]/.test(filename)) {
    return '--filename must not contain path separators or null bytes. Pass the filename on its own, such as hero.png.'
  }

  return undefined
}
