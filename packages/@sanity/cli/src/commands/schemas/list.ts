import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {listSchemas} from '../../actions/schema/listSchemas.js'
import {schemasListDebug} from '../../actions/schema/utils/debug.js'
import {parseWorkspaceSchemaId} from '../../actions/schema/utils/schemaStoreValidation.js'

const description = `
List all schemas in the current dataset.

Note: This command is experimental and subject to change.

Regenerates a manifest file by default. To reuse an existing manifest, use --no-extract-manifest.
`.trim()

export class ListSchemaCommand extends SanityCommand<typeof ListSchemaCommand> {
  static override description = description

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List all schemas found in any workspace dataset in a table',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --id _.schemas.workspaceName',
      description: 'Get a schema for a given id',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'Get stored schemas as pretty-printed json-array',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json --id _.schemas.workspaceName',
      description: 'Get singular stored schema as pretty-printed json-object',
    },
  ]

  static override flags = {
    'extract-manifest': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Regenerate manifest before listing (use --no-extract-manifest to skip)',
      hidden: true,
    }),
    id: Flags.string({
      description: 'Fetch a single schema by id',
      helpValue: '<schema_id>',
    }),
    json: Flags.boolean({
      description: 'Get schema as json',
    }),
    'manifest-dir': Flags.directory({
      default: './dist/static',
      description: 'Directory containing manifest file',
      helpValue: '<directory>',
      hidden: true,
    }),
  }

  static override hiddenAliases: string[] = ['schema:list']

  public async run(): Promise<void> {
    const {flags} = await this.parse(ListSchemaCommand)

    try {
      const projectRoot = await this.getProjectRoot()

      const errors: string[] = []
      const id = parseWorkspaceSchemaId(errors, flags.id)?.schemaId
      if (errors.length > 0) {
        this.error(`Invalid arguments:\n${errors.map((error) => `  - ${error}`).join('\n')}`, {
          exit: 1,
        })
      }

      await listSchemas({
        configPath: projectRoot.path,
        id,
        json: !!flags.json,
        output: this.output,
        workDir: projectRoot.directory,
      })
    } catch (error) {
      schemasListDebug('Failed to list schemas', error)

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.error(`Failed to list schemas:\n${errorMessage}`, {exit: 1})
    }
  }
}
