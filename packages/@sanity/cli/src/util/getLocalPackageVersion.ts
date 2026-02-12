import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

import {readPackageJson} from '@sanity/cli-core'
import {moduleResolve} from 'import-meta-resolve'

/**
 * Get the version of a package installed locally.
 *
 * @param moduleName - The name of the package in npm.
 * @param workDir - The working directory to resolve the module from. (aka project root)
 * @returns The version of the package installed locally.
 * @internal
 */
export async function getLocalPackageVersion(
  moduleName: string,
  workDir: string,
): Promise<string | null> {
  try {
    const dirUrl = pathToFileURL(resolve(workDir, 'noop.js'))
    const packageUrl = moduleResolve(`${moduleName}/package.json`, dirUrl)

    return (await readPackageJson(packageUrl)).version
  } catch {
    return null
  }
}
