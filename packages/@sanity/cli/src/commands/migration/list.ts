import {SanityCommand, subdebug} from '@sanity/cli-core'
import {chalk} from '@sanity/cli-core/ux'
import {Table} from 'console-table-printer'

import {resolveMigrations} from '../../actions/migration/resolveMigrations.js'

const listMigrationDebug = subdebug('migration:list')

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
      const migrations = await resolveMigrations(workDir)

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
}
