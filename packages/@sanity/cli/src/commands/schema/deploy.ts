import {Flags} from '@oclif/core'
import {parseStringFlag, SanityCommand} from '@sanity/cli-core'

import {deploySchemas} from '../../actions/schema/deploySchemas.js'
import {schemasDeployDebug} from '../../actions/schema/utils/debug.js'
import {parseTag} from '../../actions/schema/utils/schemaStoreValidation.js'
import {NO_DATASET_ID, NO_PROJECT_ID} from '../../util/errorMessages.js'

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
    'manifest-dir': Flags.directory({
      default: './dist/static',
      description: 'Directory containing manifest file',
      helpValue: '<directory>',
    }),
    tag: Flags.string({
      description: 'Add a tag suffix to the schema id',
      helpValue: '<tag>',
      parse: parseTag,
    }),
    verbose: Flags.boolean({
      default: false,
      description: 'Print detailed information during deployment',
    }),
    workspace: Flags.string({
      description: 'The name of the workspace to deploy a schema for',
      helpValue: '<name>',
      parse: async (input) => parseStringFlag('workspace', input),
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DeploySchemaCommand)
    const {tag, workspace} = flags

    try {
      const workDir = (await this.getProjectRoot()).directory
      const cliConfig = await this.getCliConfig()
      const projectId = await this.getProjectId()
      const dataset = cliConfig.api?.dataset

      if (!projectId) {
        this.error(NO_PROJECT_ID, {exit: 1})
      }

      if (!dataset) {
        this.error(NO_DATASET_ID, {exit: 1})
      }

      const result = await deploySchemas({
        extractManifest: flags['extract-manifest'],
        manifestDir: flags['manifest-dir'],
        output: this.output,
        tag,
        verbose: flags['verbose'],
        workDir,
        workspaceName: workspace,
      })

      if (result === 'failure') {
        this.error('Failed to deploy schemas', {exit: 1})
      }
    } catch (error) {
      schemasDeployDebug('Failed to deploy schemas', error)
      this.error(`Failed to deploy schemas:\n${error}`, {exit: 1})
    }
  }
}
