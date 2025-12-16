import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {listSchemas} from '../../actions/schema/listSchemas.js'
import {createManifestExtractor} from '../../actions/schema/utils/manifestExtractor.js'

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
    'extract-manifest': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Disables manifest generation - the command will fail if no manifest exists',
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
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ListSchemaCommand)

    try {
      const workDir = (await this.getProjectRoot()).directory
      const cliConfig = await this.getCliConfig()
      const projectId = await this.getProjectId()
      const dataset = cliConfig.api?.dataset

      if (!projectId) {
        this.error(
          'No project ID found. Please run this command from a Sanity project directory.',
          {
            exit: 1,
          },
        )
      }

      if (!dataset) {
        this.error('No dataset found. Please configure a dataset in your sanity.config.ts.', {
          exit: 1,
        })
      }

      const result = await listSchemas(flags, {
        apiClient: async () => {
          const client = await this.getGlobalApiClient({
            apiVersion: 'v2025-03-01',
            requireUser: true,
          })

          return client.withConfig({dataset, projectId})
        },
        manifestExtractor: createManifestExtractor({
          output: this.output,
          workDir,
        }),
        output: this.output,
        workDir,
      })

      if (result === 'failure') {
        this.error('Failed to list schemas', {exit: 1})
      }
    } catch (error) {
      this.error(`Failed to list schemas:\n${error}`, {exit: 1})
    }
  }
}
