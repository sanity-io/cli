import {readdir} from 'node:fs/promises'
import path from 'node:path'

import {type Migration} from '@sanity/migrate'

import {MIGRATION_SCRIPT_EXTENSIONS, MIGRATIONS_DIRECTORY} from '../../util/migration/constants.js'
import {
  isLoadableMigrationScript,
  resolveMigrationScript,
} from '../../utils/migration/resolveMigrationScript.js'

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
export function removeMigrationScriptExtension(fileName: string): string {
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
  for (const entry of migrationEntries) {
    const entryName = entry.isDirectory() ? entry.name : removeMigrationScriptExtension(entry.name)
    const candidates = await resolveMigrationScript(workDir, entryName)
    for (const candidate of candidates) {
      if (isLoadableMigrationScript(candidate)) {
        migrations.push({
          id: entryName,
          migration: candidate.mod.default,
        })
      }
    }
  }

  return migrations
}
