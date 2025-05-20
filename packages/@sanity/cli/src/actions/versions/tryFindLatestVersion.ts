import getLatestVersion from 'get-latest-version'

import {versionsDebug} from './versionsDebug.js'

/**
 * Try to find the latest version of a package.
 *
 * @param pkgName - The name of the package to find the latest version of.
 * @returns The latest version of the package.
 * @internal
 */
export async function tryFindLatestVersion(pkgName: string): Promise<string | undefined> {
  try {
    const latest = await getLatestVersion(pkgName)
    return latest
  } catch (err) {
    versionsDebug(`Cannot find version for ${pkgName}`, err)
    throw new Error(`Cannot find version for ${pkgName}`, {cause: err})
  }
}
