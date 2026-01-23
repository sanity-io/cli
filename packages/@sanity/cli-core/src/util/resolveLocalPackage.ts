import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

import {moduleResolve} from 'import-meta-resolve'

import {doImport} from './doImport.js'

/**
 * Resolves and imports a package from the local project's node_modules,
 * relative to the given working directory. This avoids circular dependencies
 * and ensures the correct version of the package is used.
 *
 * @param packageName - The name of the package to resolve (e.g., 'sanity')
 * @param workDir - The working directory to resolve the package from
 * @returns The imported module
 * @throws If the package cannot be resolved or imported
 *
 * @example
 * ```ts
 * const {createSchema} = await resolveLocalPackage('sanity', workDir)
 * ```
 *
 * @internal
 */
export async function resolveLocalPackage<T = unknown>(
  packageName: string,
  workDir: string,
): Promise<T> {
  // Create a fake cli config URL - doesn't have to be correct, just need the root path
  // This ensures we resolve packages relative to the user's repo, not the CLI package
  const fakeCliConfigUrl = pathToFileURL(resolve(workDir, 'sanity.cli.mjs'))

  try {
    const packageUrl = moduleResolve(packageName, fakeCliConfigUrl)
    const module = await doImport(packageUrl.href)
    return module as T
  } catch (error) {
    throw new Error(
      `Failed to resolve package "${packageName}" from "${workDir}": ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
