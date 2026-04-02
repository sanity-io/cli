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
  const packageUrl = resolveLocalPackagePath(packageName, workDir)
  const module = await doImport(packageUrl.href)
  return module as T
}

/**
 * Resolves the URL of a package from the local project's node_modules,
 * relative to the given working directory, without importing it.
 *
 * @param packageName - The name of the package to resolve (e.g., 'sanity')
 * @param workDir - The working directory to resolve the package from
 * @returns The resolved URL of the package entry point
 * @throws If the package cannot be resolved
 *
 * @example
 * ```ts
 * // Resolve a transitive dependency via its parent package:
 * const sanityUrl = resolveLocalPackagePath('sanity', workDir)
 * const uiUrl = resolveLocalPackagePathFrom('@sanity/ui', sanityUrl)
 * ```
 *
 * @internal
 */
export function resolveLocalPackagePath(packageName: string, workDir: string): URL {
  const fakeCliConfigUrl = pathToFileURL(resolve(workDir, 'sanity.cli.mjs'))

  try {
    return moduleResolve(packageName, fakeCliConfigUrl)
  } catch (error) {
    throw new Error(
      `Failed to resolve package "${packageName}" from "${workDir}": ${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    )
  }
}

/**
 * Resolves and imports a package relative to another resolved module URL.
 * Useful for resolving transitive dependencies that may not be directly
 * accessible from the project root (e.g., in pnpm strict mode).
 *
 * @param packageName - The name of the package to resolve
 * @param parentUrl - The URL of the parent module to resolve from
 * @returns The imported module
 * @throws If the package cannot be resolved or imported
 *
 * @example
 * ```ts
 * const sanityUrl = resolveLocalPackagePath('sanity', workDir)
 * const ui = await resolveLocalPackageFrom<typeof import('@sanity/ui')>('@sanity/ui', sanityUrl)
 * ```
 *
 * @internal
 */
export async function resolveLocalPackageFrom<T = unknown>(
  packageName: string,
  parentUrl: URL,
): Promise<T> {
  try {
    const packageUrl = moduleResolve(packageName, parentUrl)
    const module = await doImport(packageUrl.href)
    return module as T
  } catch (error) {
    throw new Error(
      `Failed to resolve package "${packageName}" from "${parentUrl.href}": ${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    )
  }
}
