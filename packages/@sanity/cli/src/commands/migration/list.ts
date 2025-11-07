import {readdir} from 'node:fs/promises'
import path from 'node:path'

import {SanityCommand, subdebug} from '@sanity/cli-core'
import {type Migration} from '@sanity/migrate'
import chalk from 'chalk'
import {Table} from 'console-table-printer'

import {MIGRATION_SCRIPT_EXTENSIONS, MIGRATIONS_DIRECTORY} from '../../util/migration/constants.js'
import {
  isLoadableMigrationScript,
  resolveMigrationScript,
} from '../../utils/migration/resolveMigrationScript.js'

const listMigrationDebug = subdebug('migration:list')

/**
 * A resolved migration, where you are guaranteed that the migration file exists
 *
 * @internal
 */
interface ResolvedMigration {
  id: string
  migration: Migration
}

export class ListMigrationCommand extends SanityCommand<typeof ListMigrationCommand> {
  static override description = 'List available migrations'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List all available migrations in the project',
    },
  ]

  public async run(): Promise<void> {
    const {directory: workDir} = await this.getProjectRoot()

    try {
      const migrations = await this.resolveMigrations(workDir)

      if (migrations.length === 0) {
        this.log('No migrations found in migrations folder of the project')
        this.log(
          `\nRun ${chalk.green('`sanity migration create <NAME>`')} to create a new migration`,
        )
        return
      }

      const table = new Table({
        columns: [
          {alignment: 'left', name: 'id', title: 'ID'},
          {alignment: 'left', name: 'title', title: 'Title'},
        ],
        title: `Found ${migrations.length} migrations in project`,
      })

      for (const definedMigration of migrations) {
        table.addRow({id: definedMigration.id, title: definedMigration.migration.title})
      }
      table.printTable()
      this.log('\nRun `sanity migration run <ID>` to run a migration')
      listMigrationDebug(`Successfully listed ${migrations.length} migrations`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.log('No migrations folder found in the project')
        this.log(
          `\nRun ${chalk.green('`sanity migration create <NAME>`')} to create a new migration`,
        )
        return
      }
      listMigrationDebug('Failed to list migrations:', error)
      this.error(
        `List migrations failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          exit: 1,
        },
      )
    }
  }

  /**
   * Removes migration script extensions from a filename
   *
   * @param fileName - The filename to process
   * @returns The filename without the extension
   * @internal
   */
  private removeMigrationScriptExtension(fileName: string): string {
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
  private async resolveMigrations(workDir: string): Promise<ResolvedMigration[]> {
    const migrationsDir = path.join(workDir, MIGRATIONS_DIRECTORY)
    const migrationEntries = await readdir(migrationsDir, {withFileTypes: true})

    const migrations: ResolvedMigration[] = []
    for (const entry of migrationEntries) {
      const entryName = entry.isDirectory()
        ? entry.name
        : this.removeMigrationScriptExtension(entry.name)
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
}
