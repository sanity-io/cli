import {readdir} from 'node:fs/promises'
import path from 'node:path'

import {type Migration} from '@sanity/migrate'

import {MIGRATION_SCRIPT_EXTENSIONS, MIGRATIONS_DIRECTORY} from './constants.js'
import {isLoadableMigrationScript, resolveMigrationScript} from './resolveMigrationScript.js'

/**
 * A resolved migration, where you are guaranteed that the migration file exists
 *
 * @internal
 */
interface ResolvedMigration {
  id: string
  migration: Migration
}

/**
 * Removes migration script extensions from a filename
 *
 * @param fileName - The filename to process
 * @returns The filename without the extension
 * @internal
 */
function removeMigrationScriptExtension(fileName: string): string {
  // Remove `.ts`, `.js` etc from the end of a filename
  const ext = MIGRATION_SCRIPT_EXTENSIONS.find((e) => fileName.endsWith(`.${e}`))
  return ext ? path.basename(fileName, `.${ext}`) : fileName
}

/**
 * Resolves all migrations in the studio working directory
 *
 * @param workDir - The studio working directory
 * @returns Array of migrations and their respective paths
 * @internal
 */
export async function resolveMigrations(workDir: string): Promise<ResolvedMigration[]> {
  const migrationsDir = path.join(workDir, MIGRATIONS_DIRECTORY)
  const migrationEntries = await readdir(migrationsDir, {withFileTypes: true})

  const migrations: ResolvedMigration[] = []
  const seen = new Set<string>()
  for (const entry of migrationEntries) {
    const entryName = entry.isDirectory() ? entry.name : removeMigrationScriptExtension(entry.name)
    // A file (e.g. `foo.ts`) and a directory (e.g. `foo/`) can both map to the
    // same id; only resolve each id once.
    if (seen.has(entryName)) {
      continue
    }

    // `resolveMigrationScript` may return several loadable candidates for a
    // single id (e.g. both `foo.ts` and `foo/index.ts`). List it just once.
    const candidate = (await resolveMigrationScript(workDir, entryName)).find((script) =>
      isLoadableMigrationScript(script),
    )
    if (candidate) {
      seen.add(entryName)
      migrations.push({id: entryName, migration: candidate.mod.default})
    }
  }

  return migrations
}
