import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {extractSchema} from '../../actions/schema/extractSchema.js'
import {getExtractOptions} from '../../actions/schema/getExtractOptions.js'
import {watchExtractSchema} from '../../actions/schema/watchExtractSchema.js'

const description = `
Extracts a JSON representation of a Sanity schema within a Studio context.

**Note**: This command is experimental and subject to change.
`.trim()

export class ExtractSchemaCommand extends SanityCommand<typeof ExtractSchemaCommand> {
  static override description = description

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> --workspace default',
      description: 'Extracts schema types in a Sanity project with more than one workspace',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --watch',
      description: 'Watch mode - re-extract on changes',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --watch --watch-patterns "lib/**/*.ts"',
      description: 'Watch with custom glob patterns',
    },
  ]

  static override flags = {
    'enforce-required-fields': Flags.boolean({
      description: 'Makes the schema generated treat fields marked as required as non-optional',
    }),
    format: Flags.string({
      default: 'groq-type-nodes',
      description: 'Format the schema as GROQ type nodes. Only available format at the moment.',
      helpValue: '<format>',
    }),
    path: Flags.string({
      description: 'Optional path to specify destination of the schema file',
    }),
    watch: Flags.boolean({
      description: 'Enable watch mode to re-extract schema on file changes',
    }),
    'watch-patterns': Flags.string({
      description: 'Additional glob pattern(s) to watch (can be specified multiple times)',
      helpValue: '<glob>',
      multiple: true,
    }),
    workspace: Flags.string({
      description: 'The name of the workspace to generate a schema for',
      helpValue: '<name>',
    }),
  }

  public async run(): Promise<{close?: () => Promise<void>} | void> {
    const {flags} = await this.parse(ExtractSchemaCommand)
    const projectRoot = await this.getProjectRoot()

    const {schemaExtraction} = await this.getCliConfig()
    const extractOptions = getExtractOptions({
      flags,
      projectRoot,
      schemaExtraction,
    })

    if (flags.watch) {
      return watchExtractSchema({
        extractOptions,
        output: this.output,
      })
    }

    return extractSchema({
      extractOptions,
      output: this.output,
    })
  }
}
