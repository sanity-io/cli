import {Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {parseStringFlag, SanityCommand, subdebug} from '@sanity/cli-core'

import {deleteSchemaAction} from '../../actions/schema/deleteSchemaAction.js'
import {parseIds} from '../../actions/schema/utils/schemaStoreValidation.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

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
  ]

  static override flags = {
    dataset: Flags.string({
      description: 'Delete schemas from a specific dataset',
      parse: async (input) => parseStringFlag('dataset', input),
    }),
    'extract-manifest': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Generate manifest file (disable with --no-extract-manifest)',
      hidden: true,
    }),
    ids: Flags.string({
      description: 'Comma-separated list of schema ids to delete',
      required: true,
    }),
    'manifest-dir': Flags.directory({
      default: './dist/static',
      description: 'Directory containing manifest file',
      hidden: true,
    }),
    verbose: Flags.boolean({
      default: false,
      description: 'Enable verbose logging',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DeleteSchemaCommand)
    const {dataset} = flags

    deleteSchemaDebug('Running schema delete with flags: %O', flags)

    const ids = parseIds(flags.ids)

    try {
      const workDir = await this.getProjectRoot()
      const projectId = await this.getProjectId()

      if (!projectId) {
        this.error(NO_PROJECT_ID, {exit: 1})
      }

      await deleteSchemaAction({
        configPath: workDir.path,
        dataset,
        ids,
        output: this.output,
        projectId,
        verbose: flags['verbose'],
        workDir: workDir.directory,
      })
    } catch (error) {
      if (error instanceof CLIError) {
        this.error(error.message, {exit: 1})
      }

      deleteSchemaDebug('Error deleting schemas', error)
      this.error(`Failed to delete schemas: ${error.message}`, {exit: 1})
    }
  }
}
