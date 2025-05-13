import semver from 'semver'

import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {trimHashFromVersion} from '../../util/trimHashFromVersion.js'
import {tryFindLatestVersion} from './tryFindLatestVersion.js'

/**
 * Check if a version is pinned.
 *
 * @internal
 */
function isPinnedVersion(version) {
  return semver.valid(version)
}

/**
 * @internal
 */
interface PromisedModuleVersionInfo {
  declared: string
  installed: Promise<string | undefined>
  isGlobal: boolean
  isPinned: boolean
  latest: Promise<string | undefined>
  name: string
}

/**
 * Build an array of package versions.
 *
 * @internal
 */
export function buildPackageArray(
  packages: Record<string, string>,
  workDir: string,
  cliVersion: string,
): PromisedModuleVersionInfo[] {
  const modules = []
  const latest = tryFindLatestVersion('@sanity/cli')
  modules.push({
    declared: `^${cliVersion}`,
    installed: Promise.resolve(trimHashFromVersion(cliVersion)),
    isGlobal: true,
    isPinned: false,
    latest: latest.then((version) => version),
    name: '@sanity/cli',
  })

  return [
    ...modules,
    ...Object.keys(packages).map((pkgName) => {
      const latest = tryFindLatestVersion(pkgName)
      const localVersion = getLocalPackageVersion(pkgName, workDir)
      return {
        declared: packages[pkgName],
        installed: localVersion.then((version) =>
          version ? trimHashFromVersion(version) : undefined,
        ),
        isGlobal: false,
        isPinned: isPinnedVersion(packages[pkgName]),
        latest: latest.then((version) => version),
        name: pkgName,
      }
    }),
  ]
}
