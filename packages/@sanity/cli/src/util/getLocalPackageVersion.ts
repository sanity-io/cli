import {join, normalize as normalizePath} from 'node:path'

import resolveFrom from 'resolve-from'

import {readPackageJson} from './readPackageJson.js'

/**
 * Get the version of a package installed locally.
 *
 * @param moduleId - The name of the package in npm.
 * @param workDir - The working directory to resolve the module from.
 * @returns The version of the package installed locally.
 * @internal
 */
export async function getLocalPackageVersion(
  moduleId: string,
  workDir: string,
): Promise<string | undefined> {
  const fromPath = workDir || process.cwd()
  const modulePath = resolveFrom.silent(fromPath, join(moduleId, 'package.json'))
  if (modulePath) {
    const pkg = await readPackageJson(modulePath)
    return pkg.version
  }

  // In the case of packages with an `exports` key, we may not be able to resolve `package.json`.
  // If this happens, try to resolve the module itself and look for the last occurence of the
  // package name, then append `package.json` to that path
  const pathSegment = normalizePath(moduleId)
  const parentPath = resolveFrom.silent(fromPath, moduleId)
  if (!parentPath) {
    return undefined
  }

  const moduleRoot = parentPath.slice(0, parentPath.lastIndexOf(pathSegment) + pathSegment.length)
  const manifestPath = join(moduleRoot, 'package.json')
  const pkg = await readPackageJson(manifestPath)
  return pkg.version
}
