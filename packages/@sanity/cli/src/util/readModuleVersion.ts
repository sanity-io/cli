import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

import {moduleResolve} from 'import-meta-resolve'

import {readPackageJson} from './readPackageJson.js'

/**
 * Reads the version number of the _installed_ module, or returns `null` if not found
 *
 * @param dir - Path of the directory to read the module from
 * @param moduleName - Name of module to get installed version for
 * @returns Version number, of null
 */
export async function readModuleVersion(dir: string, moduleName: string): Promise<string | null> {
  try {
    const dirUrl = pathToFileURL(resolve(dir, 'noop.js'))
    const packageUrl = moduleResolve(`${moduleName}/package.json`, dirUrl)

    return (await readPackageJson(packageUrl)).version
  } catch {
    return null
  }
}
