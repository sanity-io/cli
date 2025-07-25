import {dirname, resolve} from 'node:path'

/**
 * Result of finding a project configuration
 *
 * @internal
 */
export interface ProjectRootResult {
  directory: string
  /**
   * Path to the project configuration file, if found.
   */
  path: string
  /**
   * Type of project root.
   */
  type: 'app' | 'studio'
}

/**
 * Generic recursive search function for project configuration files.
 *
 * @param basePath - The base path to start searching from
 * @param findConfigFn - Function that looks for config files in a given directory
 * @param projectType - The type of project ('app' | 'studio')
 * @param iterations - Current iteration count, passed internally to prevent infinite recursion
 * @returns A promise that resolves to an object if config is found, false otherwise
 * @internal
 */
export async function recursivelyResolveProjectRoot(
  basePath: string,
  findConfigFn: (path: string) => Promise<string | undefined>,
  projectType: 'app' | 'studio',
  iterations = 0,
): Promise<false | ProjectRootResult> {
  const configPath = await findConfigFn(basePath)

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

  return recursivelyResolveProjectRoot(parentDir, findConfigFn, projectType, iterations + 1)
}
