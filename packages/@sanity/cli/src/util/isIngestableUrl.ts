/**
 * Whether a command's source argument names a remote asset for Content Lake to
 * fetch, rather than a path on the local filesystem.
 *
 * The protocol allowlist is load-bearing rather than defensive: a Windows path
 * parses as a URL whose protocol is its drive letter (`C:\media` → `c:`), so
 * matching on parseability alone would route local imports to the network.
 * Only the two protocols Content Lake can fetch over count as a URL; anything
 * else (including `file:`) is treated as a local path.
 */
export function isIngestableUrl(source: string): boolean {
  if (!URL.canParse(source)) return false
  const {protocol} = new URL(source)
  return protocol === 'http:' || protocol === 'https:'
}
