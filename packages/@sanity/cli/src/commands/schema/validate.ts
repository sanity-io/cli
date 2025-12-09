import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {validateAction} from '../../actions/schema/validateAction.js'

export class SchemaValidate extends SanityCommand<typeof SchemaValidate> {
  static override description = 'Validates all schema types specified in a workspace'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> --workspace default',
      description: 'Validates all schema types in a Sanity project with more than one workspace',
    },
    {
      command: '<%= config.bin %> <%= command.id %> > report.txt',
      description: 'Save the results of the report into a file',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --level error',
      description: 'Report out only errors',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --debug-metafile-path metafile.json',
      description:
        'Generate a report which can be analyzed with https://esbuild.github.io/analyze/',
    },
  ]

  static override flags = {
    'debug-metafile-path': Flags.string({
      description:
        'Optional path where a metafile will be written for build analysis. Only written on successful validation. Can be analyzed at https://esbuild.github.io/analyze/',
      helpGroup: 'DEBUG',
    }),
    format: Flags.string({
      default: 'pretty',
      description: 'The output format used to print schema errors and warnings',
      options: ['pretty', 'ndjson', 'json'],
    }),
    level: Flags.string({
      default: 'warning',
      description: 'The minimum level reported out',
      options: ['error', 'warning'],
    }),
    workspace: Flags.string({
      description: 'The name of the workspace to use when validating all schema types',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(SchemaValidate)

    const workDir = (await this.getProjectRoot()).directory

    const options = {
      debugMetafilePath: flags['debug-metafile-path'],
      format: flags.format,
      level: flags.level as 'error' | 'warning',
      output: this.output,
      workDir,
      workspace: flags.workspace,
    }

    await validateAction(options)
  }
}
