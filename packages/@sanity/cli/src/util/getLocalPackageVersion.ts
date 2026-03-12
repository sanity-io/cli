import {dirname, join, normalize, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

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
    // Handle import.meta.url being passed instead of a directory path
    const dir = workDir.startsWith('file://') ? dirname(fileURLToPath(workDir)) : workDir
    const dirUrl = pathToFileURL(resolve(dir, 'noop.js'))

    let packageJsonUrl: URL
    try {
      packageJsonUrl = moduleResolve(`${moduleName}/package.json`, dirUrl)
    } catch (err: unknown) {
      if (isErrPackagePathNotExported(err)) {
        // Fallback: resolve main entry point and derive package root
        const mainUrl = moduleResolve(moduleName, dirUrl)
        const mainPath = fileURLToPath(mainUrl)
        const normalizedName = normalize(moduleName)
        const idx = mainPath.lastIndexOf(normalizedName)
        const moduleRoot = mainPath.slice(0, idx + normalizedName.length)
        packageJsonUrl = pathToFileURL(join(moduleRoot, 'package.json'))
      } else {
        throw err
      }
    }

    return (await readPackageJson(packageJsonUrl)).version
  } catch {
    return null
  }
}

function isErrPackagePathNotExported(err: unknown): boolean {
  return err instanceof Error && 'code' in err && err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
}
