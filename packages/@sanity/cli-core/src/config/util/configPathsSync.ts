import {existsSync, readFileSync} from 'node:fs'
import {basename, join} from 'node:path'

/**
 * @internal
 */
interface PathResult {
  exists: boolean
  path: string
}

/**
 * Checks for a `sanity.json` file with `"root": true` in the given directory synchronously.
 *
 * @param basePath - The base path to look for a `sanity.json` in
 * @returns true if a `sanity.json` with `"root": true` is found, false otherwise
 * @internal
 */
function isSanityV2StudioRootSync(basePath: string): boolean {
  try {
    const content = readFileSync(join(basePath, 'sanity.json'), 'utf8')
    const sanityJson = JSON.parse(content)
    if (!sanityJson || typeof sanityJson !== 'object' || Array.isArray(sanityJson)) {
      throw new Error('Invalid sanity.json, expected an object')
    }
    const isRoot = Boolean(sanityJson?.root)
    return isRoot
  } catch {
    return false
  }
}

/**
 * Finds the path for a given set of files synchronously.
 *
 * @param basePath - The base path to search for files.
 * @param files - The files to search for.
 * @returns Array of path results
 * @internal
 */
function findPathForFilesSync(basePath: string, files: string[]): PathResult[] {
  return files.map((file) => {
    const path = join(basePath, file)
    const exists = existsSync(path)
    return {exists, path}
  })
}

/**
 * Resolves to a string containing the found config path, or `undefined` if not found.
 * Throws if Sanity v2 studio root is found.
 *
 * @param basePath - The base path to start searching from
 * @returns A string containing the found config path, or `undefined` if not found
 * @internal
 */
export function findStudioConfigPathSync(basePath: string): string | undefined {
  if (isSanityV2StudioRootSync(basePath)) {
    throw new Error(
      `Found 'sanity.json' at ${basePath} - Sanity Studio < v3 is no longer supported`,
    )
  }

  const paths = findPathForFilesSync(basePath, [
    'sanity.config.ts',
    'sanity.config.tsx',
    'sanity.config.js',
    'sanity.config.jsx',
  ])

  const configPaths = paths.filter((path) => path.exists)
  if (configPaths.length > 1) {
    const baseNames = configPaths.map((config) => config.path).map((path) => basename(path))
    throw new Error(`Multiple studio config files found (${baseNames.join(', ')})`)
  }

  if (configPaths.length === 1) {
    return configPaths[0].path
  }
}

/**
 * Resolves to a string containing the found config path, or `undefined` if not found.
 *
 * @param basePath - The base path to start searching from
 * @returns A string containing the found config path, or `undefined` if not found
 * @internal
 */
export function findAppConfigPathSync(basePath: string): string | undefined {
  const paths = findPathForFilesSync(basePath, ['sanity.cli.ts', 'sanity.cli.js'])
  const configPaths = paths.filter((path) => path.exists)
  if (configPaths.length > 1) {
    throw new Error(
      `Multiple app config files found (${configPaths.map((path) => path.path).join(', ')})`,
    )
  }

  if (configPaths.length === 1) {
    return configPaths[0].path
  }
}
