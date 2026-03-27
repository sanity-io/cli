import {dirname, resolve} from 'node:path'

import {ProjectRootNotFoundError} from '../errors/ProjectRootNotFoundError.js'
import {findAppConfigPathSync, findStudioConfigPathSync} from './util/configPathsSync.js'
import {ProjectRootResult} from './util/recursivelyResolveProjectRoot.js'

/**
 * Generic recursive search function for project configuration files (synchronous version).
 *
 * @param basePath - The base path to start searching from
 * @param findConfigFn - Function that looks for config files in a given directory
 * @param projectType - The type of project ('app' | 'studio')
 * @param iterations - Current iteration count, passed internally to prevent infinite recursion
 * @returns An object if config is found, false otherwise
 * @internal
 */
function recursivelyResolveProjectRootSync(
  basePath: string,
  findConfigFn: (path: string) => string | undefined,
  projectType: 'app' | 'studio',
  iterations = 0,
): false | ProjectRootResult {
  const configPath = findConfigFn(basePath)

  if (configPath) {
    return {
      directory: dirname(configPath),
      path: configPath,
      type: projectType,
    }
  }

  const parentDir = resolve(basePath, '..')
  if (parentDir === basePath || iterations > 50) {
    // Reached root (or max depth), give up
    return false
  }

  return recursivelyResolveProjectRootSync(parentDir, findConfigFn, projectType, iterations + 1)
}

/**
 * Resolve project root directory and type synchronously.
 *
 * Project root is:
 * - `studio` - A pre-blueprints Sanity studio root (containing `sanity.config.(ts|js)`)
 * - `app` - A Sanity app root (containing `sanity.cli.(ts|js)`)
 *
 * If a Sanity Studio v2/v1 root is found (containing `sanity.json` with `root: true`),
 * an error is thrown, as v2/v1 is no longer supported.
 *
 * @param cwd - Current working directory to start searching from
 * @returns Project root result
 * @internal
 */
export function findProjectRootSync(cwd: string): ProjectRootResult {
  try {
    // First try to find a studio project root, looks for `sanity.config.(ts|js)`
    const studioProjectRoot = resolveProjectRootForStudioSync(cwd)
    if (studioProjectRoot) {
      return studioProjectRoot
    }

    // Second try to find a app project root, looks for `sanity.cli.(ts|js)`
    const appProjectRoot = resolveProjectRootForAppSync(cwd)
    if (appProjectRoot) {
      return appProjectRoot
    }

    // If nothing is found throw a specific error
    throw new ProjectRootNotFoundError(`No project root found in ${cwd}`)
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
 * @returns An object if config is found, false otherwise
 * @internal
 */
function resolveProjectRootForStudioSync(
  basePath: string,
  iterations = 0,
): false | ProjectRootResult {
  return recursivelyResolveProjectRootSync(basePath, findStudioConfigPathSync, 'studio', iterations)
}

/**
 * Recursively searches for a app project configuration file in the given directory and its parents.
 *
 * @param basePath - The base path to start searching from
 * @param iterations - Current iteration count, passed internally to prevent infinite recursion.
 * @returns An object if config is found, false otherwise
 * @internal
 */
function resolveProjectRootForAppSync(basePath: string, iterations = 0): false | ProjectRootResult {
  return recursivelyResolveProjectRootSync(basePath, findAppConfigPathSync, 'app', iterations)
}
