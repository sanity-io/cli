import {basename} from 'node:path'

import {findPathForFiles} from './findConfigsPaths.js'
import {isSanityV2StudioRoot} from './isSanityV2StudioRoot.js'

/**
 * Resolves to a string containing the found config path, or `false` if not found.
 * Throws if Sanity v2 studio root is found.
 *
 * @param basePath - The base path to start searching from
 * @returns A promise that resolves to a string containing the found config path, or `undefined` if not found
 * @internal
 */
export async function findStudioConfigPath(basePath: string): Promise<string | undefined> {
  if (await isSanityV2StudioRoot(basePath)) {
    throw new Error(
      `Found 'sanity.json' at ${basePath} - Sanity Studio < v3 is no longer supported`,
    )
  }

  const paths = await findPathForFiles(basePath, [
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
