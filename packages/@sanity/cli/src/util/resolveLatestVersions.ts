import {getLatestVersion} from 'get-latest-version'
import promiseProps from 'promise-props-recursive'

// Cap each lookup so a stuck npm request can't hang `init` (or crash it with Node's
// "unsettled top-level await" exit, code 13). On timeout, fall back to the `latest` tag.
const LOOKUP_TIMEOUT_MS = 30_000

/**
 * Resolve the latest versions of given packages within their defined ranges
 *
 * @param pkgs - `{packageName: rangeOrTag}`
 * @returns Object of resolved version numbers
 */
export function resolveLatestVersions(
  pkgs: Record<string, string>,
): Promise<Record<string, string>> {
  const lookups: Record<string, Promise<string> | string> = {}
  for (const [packageName, range] of Object.entries(pkgs)) {
    lookups[packageName] =
      range === 'latest'
        ? withTimeout(getLatestVersion(packageName, {range}).then(caretify), 'latest')
        : range
  }

  return promiseProps(lookups)
}

function caretify(version: string | undefined) {
  return version ? `^${version}` : 'latest'
}

/**
 * Resolve `fallback` if `promise` stalls past the timeout. The timer is deliberately not
 * `unref`'d — keeping the event loop alive is what prevents the exit-13.
 */
function withTimeout(promise: Promise<string>, fallback: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(fallback), LOOKUP_TIMEOUT_MS)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}
