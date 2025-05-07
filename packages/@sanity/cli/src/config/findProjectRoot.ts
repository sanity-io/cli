import {access} from 'node:fs/promises'
import {basename, dirname, join, resolve} from 'node:path'

import {readJsonFile} from '../util/readJsonFile.js'

/**
 * Result of finding the project configuration
 *
 * @internal
 */
interface ProjectRootResult {
  directory: string
  path: string
  type: 'blueprint' | 'studio'
}

/**
 * Resolve project root directory and type, falling back to cwd if it cannot be found.
 *
 * Project root is either:
 * - `blueprint` - A blueprints root (containing `blueprint.(ts|js)`)
 * - `studio` - A pre-blueprints Sanity studio root (containing `sanity.config.(ts|js)`)
 *
 * If a Sanity Studio v2/v1 root is found (containing `sanity.json` with `root: true`),
 * an error is thrown, as v2/v1 is no longer supported.
 *
 * @internal
 */
export async function findProjectRoot(cwd: string): Promise<false | ProjectRootResult> {
  try {
    return resolveProjectRoot(cwd)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : `${err}`
    throw new Error(`Error occurred trying to resolve project root:\n${message}`)
  }
}

/**
 * Resolves to a string containing the found config path, or `false` if not found.
 * Throws if Sanity v2 studio root is found.
 *
 * @param basePath - The base path to start searching from
 * @returns A promise that resolves to a string containing the found config path, or `false` if not found
 * @internal
 */
export async function findStudioConfigPath(basePath: string): Promise<false | string> {
  const tsStudioPath = join(basePath, 'sanity.config.ts')
  const tsxStudioPath = join(basePath, 'sanity.config.tsx')
  const jsStudioPath = join(basePath, 'sanity.config.js')
  const jsxStudioPath = join(basePath, 'sanity.config.jsx')

  const studioConfigs = await Promise.all(
    [tsStudioPath, tsxStudioPath, jsStudioPath, jsxStudioPath].map(async (path) => ({
      exists: await fileExists(path),
      path,
    })),
  )

  const configPaths = studioConfigs.filter((config) => config.exists)
  if (configPaths.length > 1) {
    const baseNames = configPaths.map((config) => config.path).map((path) => basename(path))
    throw new Error(`Multiple studio config files found (${baseNames.join(', ')})`)
  }

  if (configPaths.length === 1) {
    return configPaths[0].path
  }

  if (await isSanityV2StudioRoot(basePath)) {
    throw new Error(
      `Found 'sanity.json' at ${basePath} - Sanity Studio < v3 is no longer supported`,
    )
  }

  return false
}

/**
 * Resolves to a string containing the found blueprint path, or `false` if not found.
 *
 * @param basePath - The base path to start searching from
 * @returns A promise that resolves to a string containing the found blueprint path, or `false` if not found
 * @internal
 */
async function findBlueprintConfigPath(basePath: string): Promise<false | string> {
  const tsBlueprintPath = join(basePath, 'blueprint.ts')
  const jsBlueprintPath = join(basePath, 'blueprint.js')

  const [tsBlueprint, jsBlueprint] = await Promise.all([
    fileExists(tsBlueprintPath),
    fileExists(jsBlueprintPath),
  ])

  if (tsBlueprint) {
    return tsBlueprintPath
  }

  if (jsBlueprint) {
    return jsBlueprintPath
  }

  return false
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
async function resolveProjectRoot(
  basePath: string,
  iterations = 0,
): Promise<false | ProjectRootResult> {
  const [studioConfigPath, blueprintConfigPath] = await Promise.all([
    findStudioConfigPath(basePath),
    findBlueprintConfigPath(basePath),
  ])

  if (studioConfigPath && blueprintConfigPath) {
    // @todo
    throw new Error('Both studio and blueprint file found - what do we do?')
  }

  if (studioConfigPath) {
    return {
      directory: dirname(studioConfigPath),
      path: studioConfigPath,
      type: 'studio',
    }
  }

  if (blueprintConfigPath) {
    return {
      directory: dirname(blueprintConfigPath),
      path: blueprintConfigPath,
      type: 'blueprint',
    }
  }

  const parentDir = resolve(basePath, '..')
  if (parentDir === basePath || iterations > 50) {
    // Reached root (or max depth), give up
    return false
  }

  return resolveProjectRoot(parentDir, iterations + 1)
}

/**
 * Checks for a `sanity.json` file with `"root": true` in the given directory.
 *
 * @param basePath - The base path to look for a `sanity.json` in
 * @returns Resolves to true if a `sanity.json` with `"root": true` is found, false otherwise
 * @internal
 */
async function isSanityV2StudioRoot(basePath: string): Promise<boolean> {
  try {
    const sanityJson = await readJsonFile(join(basePath, 'sanity.json'))
    const isRoot = Boolean(sanityJson?.root)
    return isRoot
  } catch {
    return false
  }
}

/**
 * Checks if a file exists and can be "accessed".
 * Prone to race conditions, but good enough for our use cases.
 *
 * @param filePath - The path to the file to check
 * @returns A promise that resolves to true if the file exists, false otherwise
 * @internal
 */
function fileExists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false,
  )
}
