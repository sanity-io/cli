import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {deploySchemas} from '../../actions/schema/deploySchemas.js'
import {formatSchemaValidation} from '../../actions/schema/formatSchemaValidation.js'
import {schemasDeployDebug} from '../../actions/schema/utils/debug.js'
import {SchemaExtractionError} from '../../actions/schema/utils/SchemaExtractionError.js'
import {parseTag} from '../../actions/schema/utils/schemaStoreValidation.js'

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
      parse: async (input) => {
        if (!input) throw new Error('workspace argument is empty')
        return input
      },
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DeploySchemaCommand)
    const {tag, workspace} = flags

    try {
      const workDir = (await this.getProjectRoot()).directory

      await deploySchemas({
        output: this.output,
        tag,
        verbose: flags['verbose'],
        workDir,
        workspaceName: workspace,
      })

      this.log(
        `${styleText('gray', '↳ List deployed schemas with:')} ${styleText('cyan', 'sanity schema list')}`,
      )
    } catch (error) {
      if (
        error instanceof SchemaExtractionError &&
        error.validation &&
        error.validation.length > 0
      ) {
        this.output.log(formatSchemaValidation(error.validation))
        this.exit(1)
      }

      schemasDeployDebug('Failed to deploy schemas', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.error(`Failed to deploy schemas:\n${errorMessage}`, {exit: 1})
    }
  }
}
