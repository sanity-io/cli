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
    dataset: Flags.string({
      description: 'Delete schemas from a specific dataset',
    }),
    'extract-manifest': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Generate manifest file (use --no-extract-manifest to disable)',
    }),
    ids: Flags.string({
      description: 'Comma-separated list of schema ids to delete',
      required: true,
    }),
    'manifest-dir': Flags.string({
      default: './dist/static',
      description: 'Directory containing manifest file',
    }),
    verbose: Flags.boolean({
      default: false,
      description: 'Enable verbose output',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DeleteSchemaCommand)
    const workDir = (await this.getProjectRoot()).directory

    // Get the project ID upfront
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error('No project ID found. Please run this command from a Sanity project directory.', {
        exit: 1,
      })
    }

    // Get the CLI config to find the dataset
    const cliConfig = await this.getCliConfig()
    const dataset = cliConfig.api?.dataset

    // Pre-fetch the client so we can use it synchronously in the adapter
    const baseClient = await this.getProjectApiClient({
      apiVersion: 'v2025-03-01',
      projectId,
      requireUser: true,
    })

    // Create CLI output adapter
    const output: CliOutputter = {
      clear: () => {
        // no-op for now
      },
      error: (...args: unknown[]) => this.error(String(args.join(' ')), {exit: false}),
      print: (...args: unknown[]) => this.log(String(args.join(' '))),
      spinner: (options) => {
        // For now, return a simple mock spinner
        // In a real implementation, this would use ora
        const spinner = {
          fail: () => spinner,
          start: () => spinner,
          stop: () => spinner,
          succeed: () => spinner,
          text: '',
        }
        if (typeof options === 'string') {
          spinner.text = options
        }
        return spinner as ReturnType<CliOutputter['spinner']>
      },
      success: (...args: unknown[]) => this.log(`✔ ${args.join(' ')}`),
      warn: (...args: unknown[]) => this.warn(String(args.join(' '))),
    }

    // Create API client adapter that returns the pre-fetched client
    const apiClient: CliApiClient = (_options) => {
      // Return the pre-configured client with default dataset if available
      if (dataset) {
        return baseClient.withConfig({dataset})
      }
      return baseClient
    }

    try {
      const result = await deleteSchemaAction(flags, {
        apiClient,
        jsonReader: undefined,
        manifestExtractor: async () => {
          // Manifest extractor will be called by the action
        },
        output,
        workDir,
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

