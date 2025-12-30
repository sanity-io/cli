import {Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {deleteSchemaAction} from '../../actions/schema/deleteSchemaAction.js'
import {createManifestExtractor} from '../../actions/schema/utils/manifestExtractor.js'

const deleteSchemaDebug = subdebug('schema:delete')

export class DeleteSchemaCommand extends SanityCommand<typeof DeleteSchemaCommand> {
  static override description = 'Delete schema documents by id'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> --ids sanity.workspace.schema.workspaceName',
      description: 'Delete a single schema',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --ids sanity.workspace.schema.workspaceName,prefix.sanity.workspace.schema.otherWorkspace',
      description: 'Delete multiple schemas',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --no-extract-manifest --ids sanity.workspace.schema.workspaceName',
      description:
        'Delete using a pre-existing manifest file (config changes in sanity.config will not be picked up)',
    },
  ]

  static override flags = {
    dataset: Flags.string({
      description: 'Delete schemas from a specific dataset',
    }),
    'extract-manifest': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Generate manifest file (disable with --no-extract-manifest)',
    }),
    ids: Flags.string({
      description: 'Comma-separated list of schema ids to delete',
      required: true,
    }),
    'manifest-dir': Flags.directory({
      default: './dist/static',
      description: 'Directory containing manifest file',
    }),
    verbose: Flags.boolean({
      default: false,
      description: 'Enable verbose logging',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DeleteSchemaCommand)

    deleteSchemaDebug('Running schema delete with flags: %O', flags)

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

      const result = await deleteSchemaAction(flags, {
        manifestExtractor: createManifestExtractor({
          output: this.output,
          workDir,
        }),
        output: this.output,
        projectId,
        workDir,
      })

      if (result === 'failure') {
        this.error('Failed to delete schemas', {exit: 1})
      }
    } catch (error) {
      const err = error as Error
      deleteSchemaDebug('Error deleting schemas', err)
      this.error(`Failed to delete schemas: ${err.message}`, {exit: 1})
    }
  }
}
