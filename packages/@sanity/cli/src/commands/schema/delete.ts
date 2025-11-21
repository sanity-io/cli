import {Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {deleteSchemaAction} from '../../actions/schema/deleteSchemaAction.js'
import {type CliApiClient, type CliOutputter} from '../../types.js'

const schemaDeleteDebug = subdebug('schema:delete')

export class DeleteSchemaCommand extends SanityCommand<typeof DeleteSchemaCommand> {
  static override description = 'Delete schema documents by id.'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> --ids sanity.workspace.schema.workspaceName',
      description: 'Delete single schema',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --ids sanity.workspace.schema.workspaceName,prefix.sanity.workspace.schema.otherWorkspace',
      description: 'Delete multiple schemas',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --no-extract-manifest --ids sanity.workspace.schema.workspaceName',
      description: 'Runs using a pre-existing manifest file',
    },
  ]

  static override flags = {
    ids: Flags.string({
      description: 'Comma-separated list of schema ids to delete',
      required: true,
    }),
    dataset: Flags.string({
      description: 'Delete schemas from a specific dataset',
    }),
    'manifest-dir': Flags.string({
      description: 'Directory containing manifest file',
      default: './dist/static',
    }),
    'extract-manifest': Flags.boolean({
      description: 'Generate manifest file (use --no-extract-manifest to disable)',
      default: true,
      allowNo: true,
    }),
    verbose: Flags.boolean({
      description: 'Enable verbose output',
      default: false,
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DeleteSchemaCommand)
    const workDir = await this.getWorkDir()

    // Create CLI output adapter
    const output: CliOutputter = {
      print: (...args: unknown[]) => this.log(String(args.join(' '))),
      success: (...args: unknown[]) => this.log(`✔ ${args.join(' ')}`),
      warn: (...args: unknown[]) => this.warn(String(args.join(' '))),
      error: (...args: unknown[]) => this.error(String(args.join(' ')), {exit: false}),
      clear: () => {
        // no-op for now
      },
      spinner: (options) => {
        // For now, return a simple mock spinner
        // In a real implementation, this would use ora
        const spinner = {
          start: () => spinner,
          stop: () => spinner,
          succeed: () => spinner,
          fail: () => spinner,
          text: '',
        }
        if (typeof options === 'string') {
          spinner.text = options
        }
        return spinner as ReturnType<CliOutputter['spinner']>
      },
    }

    // Create API client adapter
    const apiClient: CliApiClient = (options) => {
      return this.getProjectApiClient({
        requireUser: options?.requireUser ?? false,
        requireProject: options?.requireProject ?? false,
      })
    }

    try {
      const result = await deleteSchemaAction(flags, {
        output,
        apiClient,
        workDir,
        jsonReader: undefined,
        manifestExtractor: async () => {
          // Manifest extractor will be called by the action
        },
      })

      if (result === 'failure') {
        this.error('Schema delete failed', {exit: 1})
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(`${error}`)
      schemaDeleteDebug('Error deleting schemas', err)
      this.error(`Schema delete failed: ${err.message}`, {exit: 1})
    }
  }
}

