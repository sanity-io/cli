import {existsSync} from 'node:fs'
import {join as joinPath} from 'node:path'

/**
 * Finds the nearest `package.json` from the given `fromDir`, starting with that directory itself.
 *
 * Returns `undefined` if no `package.json` is found (traverses up to the root directory,
 * or to a maximum depth of 50 directories).
 *
 * @param fromDir - The directory to start searching from.
 * @param iterations - The number of iterations (recursion depth) to prevent infinite loops.
 * @returns The path to the nearest `package.json` and the directory it is in.
 * @internal
 */
export function findNearestPackage(
  fromDir: string,
  iterations = 0,
):
  | {
      packageDir: string
      packageJsonPath: string
    }
  | undefined {
  const packageJsonPath = joinPath(fromDir, 'package.json')
  if (existsSync(packageJsonPath)) {
    return {packageDir: fromDir, packageJsonPath}
  }

  const parent = joinPath(fromDir, '..')
  if (parent === fromDir || iterations > 50) {
    return undefined
  }

  return findNearestPackage(parent, iterations + 1)
}
