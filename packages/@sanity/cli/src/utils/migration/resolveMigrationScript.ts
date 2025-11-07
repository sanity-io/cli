import path from 'node:path'

import {fileExists} from '@sanity/cli-core'
import {type Migration} from '@sanity/migrate'
import {getTsconfig} from 'get-tsconfig'
import {isPlainObject} from 'lodash-es'
import {tsImport} from 'tsx/esm/api'

import {MIGRATION_SCRIPT_EXTENSIONS, MIGRATIONS_DIRECTORY} from '../../util/migration/constants.js'

interface ResolvedMigrationScript {
  /**
   * Absolute path to the migration script
   */
  absolutePath: string

  /**
   * Relative path from the working directory to the migration script
   */
  relativePath: string

  /**
   * The migration module, if it could be resolved - otherwise `undefined`
   */
  mod?: {default: Migration; down?: unknown; up?: unknown}
}

/**
 * Resolves the potential paths to a migration script.
 * Considers the following paths (where `<ext>` is 'mjs', 'js', 'ts' or 'cjs'):
 *
 * - `<migrationsDir>/<migrationName>.<ext>`
 * - `<migrationsDir>/<migrationName>/index.<ext>`
 *
 * Note that all possible paths are returned, even if the files do not exist.
 * Check the `mod` property to see if a module could actually be loaded.
 *
 * @param workDir - Working directory of the studio
 * @param migrationName - The name of the migration directory to resolve
 * @returns An array of potential migration scripts
 * @internal
 */
export async function resolveMigrationScript(
  workDir: string,
  migrationName: string,
): Promise<ResolvedMigrationScript[]> {
  const tsconfig = getTsconfig(workDir)
  const locations = [migrationName, path.join(migrationName, 'index')]
  const results: ResolvedMigrationScript[] = []

  for (const location of locations) {
    for (const ext of MIGRATION_SCRIPT_EXTENSIONS) {
      const relativePath = path.join(MIGRATIONS_DIRECTORY, `${location}.${ext}`)
      const absolutePath = path.resolve(workDir, relativePath)
      let mod: {default: Migration; down?: unknown; up?: unknown} | undefined

      // Check if the file exists before trying to import it
      const exists = await fileExists(absolutePath)
      if (!exists) {
        continue
      }

      try {
        const imported = await tsImport(absolutePath, {
          parentURL: import.meta.url,
          tsconfig: tsconfig?.path,
        })
        // Handle both ESM and CJS default exports
        mod = imported as {default: Migration; down?: unknown; up?: unknown}
      } catch (err) {
        // Ignore MODULE_NOT_FOUND errors, but throw others
        if (
          (err as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND' &&
          (err as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND'
        ) {
          throw new Error(`Error loading migration: ${(err as Error).message}`)
        }
      }

      results.push({absolutePath, mod, relativePath})
    }
  }

  return results
}

/**
 * Checks whether or not the passed resolved migration script is actually loadable (eg has a default export)
 *
 * @param script - The resolved migration script to check
 * @returns `true` if the script is loadable, `false` otherwise
 * @internal
 */
export function isLoadableMigrationScript(
  script: ResolvedMigrationScript,
): script is Required<ResolvedMigrationScript> {
  if (script.mod === undefined || !isPlainObject(script.mod.default)) {
    return false
  }

  const mod = script.mod.default
  return typeof mod.title === 'string' && mod.migrate !== undefined
}
