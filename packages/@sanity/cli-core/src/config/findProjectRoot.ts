import {ProjectRootNotFoundError} from '../errors/ProjectRootNotFoundError.js'
import {findAppConfigPath} from './util/findAppConfigPath.js'
import {tryFindStudioConfigPath} from './util/findStudioConfigPath.js'
import {
  type ProjectRootResult,
  recursivelyResolveProjectRoot,
} from './util/recursivelyResolveProjectRoot.js'

/**
 * Resolve project root directory and type.
 *
 * Project root is:
 * - `studio` - A pre-blueprints Sanity studio root (containing `sanity.config.(ts|js)`)
 * - `app` - A Sanity app root (containing `sanity.cli.(ts|js)`)
 *
 * If a Sanity Studio v2/v1 root is found (containing `sanity.json` with `root: true`),
 * an error is thrown, as v2/v1 is no longer supported.
 *
 * @internal
 */
export async function findProjectRoot(cwd: string): Promise<ProjectRootResult> {
  try {
    // First try to find a studio project root, looks for `sanity.config.(ts|js)`
    const studioProjectRoot = await resolveProjectRootForStudio(cwd)
    if (studioProjectRoot) {
      return studioProjectRoot
    }

    // Second try to find a app project root, looks for `sanity.cli.(ts|js)`
    const appProjectRoot = await resolveProjectRootForApp(cwd)
    if (appProjectRoot) {
      return appProjectRoot
    }

    // If nothing is found throw a specific error
    throw new ProjectRootNotFoundError('No project root found')
  } catch (err: unknown) {
    if (err instanceof ProjectRootNotFoundError) {
      throw err
    }
    const message = err instanceof Error ? err.message : `${err}`
    throw new Error(`Error occurred trying to resolve project root:\n${message}`, {cause: err})
  }
}

/**
 * Recursively searches for a project configuration file in the given directory and its parents.
 * Throws if Sanity v2 studio root is found.
 *
 * @param basePath - The base path to start searching from
 * @param iterations - Current iteration count, passed internally to prevent infinite recursion.
 * @returns A promise that resolves to an object if config is found, false otherwise
 * @internal
 */
async function resolveProjectRootForStudio(
  basePath: string,
  iterations = 0,
): Promise<false | ProjectRootResult> {
  return recursivelyResolveProjectRoot(basePath, tryFindStudioConfigPath, 'studio', iterations)
}

/**
 * Recursively searches for a app project configuration file in the given directory and its parents.
 *
 * @param basePath - The base path to start searching from
 * @param iterations - Current iteration count, passed internally to prevent infinite recursion.
 * @returns A promise that resolves to an object if config is found, false otherwise
 * @internal
 */
async function resolveProjectRootForApp(
  basePath: string,
  iterations = 0,
): Promise<false | ProjectRootResult> {
  return recursivelyResolveProjectRoot(basePath, findAppConfigPath, 'app', iterations)
}
