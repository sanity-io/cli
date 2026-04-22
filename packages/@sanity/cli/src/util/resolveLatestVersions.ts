import {getLatestVersion} from 'get-latest-version'
import promiseProps from 'promise-props-recursive'
import semver from 'semver'

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
    const isDistTag = semver.validRange(range) === null
    lookups[packageName] = isDistTag
      ? getLatestVersion(packageName, {range}).then((version) => caretify(version, range))
      : range
  }

  return promiseProps(lookups)
}

function caretify(version: string | undefined, fallback: string) {
  return version ? `^${version}` : fallback
}
