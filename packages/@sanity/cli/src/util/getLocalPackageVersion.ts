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
    const packageDir = getLocalPackageDir(moduleName, workDir)
    return (await readPackageJson(join(packageDir, 'package.json'))).version
  } catch {
    return null
  }
}

/**
 * Resolve the filesystem directory of a locally installed package using Node
 * module resolution. Works correctly with hoisted packages in monorepos/workspaces,
 * pnpm symlinks, and other non-standard node_modules layouts.
 *
 * @param moduleName - The name of the package in npm.
 * @param workDir - The working directory to resolve the module from. (aka project root)
 * @returns The absolute path to the package directory.
 * @internal
 */
export function getLocalPackageDir(moduleName: string, workDir: string): string {
  // Handle import.meta.url being passed instead of a directory path
  const dir = workDir.startsWith('file://') ? dirname(fileURLToPath(workDir)) : workDir
  const dirUrl = pathToFileURL(resolve(dir, 'noop.js'))

  try {
    const packageJsonUrl = moduleResolve(`${moduleName}/package.json`, dirUrl)
    return dirname(fileURLToPath(packageJsonUrl))
  } catch (err: unknown) {
    if (!isErrPackagePathNotExported(err)) {
      throw err
    }
  }

  // Fallback: resolve main entry point and derive package root
  const mainUrl = moduleResolve(moduleName, dirUrl)
  const mainPath = fileURLToPath(mainUrl)
  const normalizedName = normalize(moduleName)
  const idx = mainPath.lastIndexOf(normalizedName)
  if (idx === -1) {
    throw new Error(`Could not determine package directory for '${moduleName}'`)
  }
  return mainPath.slice(0, idx + normalizedName.length)
}

function isErrPackagePathNotExported(err: unknown): boolean {
  return err instanceof Error && 'code' in err && err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
}
