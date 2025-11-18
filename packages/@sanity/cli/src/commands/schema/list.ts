import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

const description = `
Lists all schemas in the current dataset.

**Note**: This command is experimental and subject to change.

This operation (re-)generates a manifest file describing the sanity config workspace by default.
To re-use an existing manifest file, use --no-extract-manifest.
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
    {
      command: '<%= config.bin %> <%= command.id %> --no-extract-manifest',
      description:
        'Runs using a pre-existing manifest file. Config changes in sanity.config will not be picked up in this case.',
    },
  ]

  static override flags = {
    id: Flags.string({
      description: 'Fetch a single schema by id',
      helpValue: '<schema_id>',
    }),
    json: Flags.boolean({
      description: 'Get schema as json',
    }),
    'manifest-dir': Flags.string({
      default: './dist/static',
      description: 'Directory containing manifest file',
      helpValue: '<directory>',
    }),
    'no-extract-manifest': Flags.boolean({
      description: 'Disables manifest generation - the command will fail if no manifest exists',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ListSchemaCommand)

    this.log(JSON.stringify(flags))
  }
}
