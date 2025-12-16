import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {deploySchemas} from '../../actions/schema/deploySchemas.js'
import { createManifestExtractor } from '../../actions/schema/utils/manifestExtractor.js'

const description = `
Deploy schema documents into workspace datasets.

**Note**: This command is experimental and subject to change.

This operation (re-)generates a manifest file describing the sanity config workspace by default.
To re-use an existing manifest file, use --no-extract-manifest.
`.trim()

export class DeploySchemaCommand extends SanityCommand<typeof DeploySchemaCommand> {
  static override description = description

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Deploy all workspace schemas',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --workspace default',
      description: 'Deploy the schema for only the workspace "default"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --no-extract-manifest',
      description: 'Runs using a pre-existing manifest file. Config changes in sanity.config will not be picked up in this case.',
    },
  ]

  static override flags = {
    'extract-manifest': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Disables manifest generation - the command will fail if no manifest exists',
    }),
    'manifest-dir': Flags.string({
      default: './dist/static',
      description: 'Directory containing manifest file',
      helpValue: '<directory>',
    }),
    tag: Flags.string({
      description: 'Add a tag suffix to the schema id',
      helpValue: '<tag>',
    }),
    verbose: Flags.boolean({
      default: false,
      description: 'Print detailed information during deployment',
    }),
    workspace: Flags.string({
      description: 'The name of the workspace to deploy a schema for',
      helpValue: '<name>',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DeploySchemaCommand)

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

      const result = await deploySchemas(flags, {
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
