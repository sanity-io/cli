/**
 * Whether a command's source argument names a remote asset for Content Lake to
 * fetch, rather than a path on the local filesystem.
 *
 * The protocol allowlist is load-bearing rather than defensive: a Windows path
 * parses as a URL whose protocol is its drive letter (`C:\media` → `c:`), so
 * matching on parseability alone would route local imports to the network.
 * Anything else, `file:` included, is treated as a local path.
 *
 * `http:` counts as remote even though Content Lake only fetches over `https:`,
 * so that an insecure URL reaches `getIngestUrlError` and is reported as one,
 * rather than being stat'ed as a directory that does not exist.
 */
export function isRemoteAssetSource(source: string): boolean {
  if (!URL.canParse(source)) return false
  const {protocol} = new URL(source)
  return protocol === 'http:' || protocol === 'https:'
}
