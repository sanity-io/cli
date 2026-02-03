import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {extractSchema} from '../../actions/schema/extractSchema.js'

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
  ]

  static override flags = {
    'enforce-required-fields': Flags.boolean({
      default: false,
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
    workspace: Flags.string({
      description: 'The name of the workspace to generate a schema for',
      helpValue: '<name>',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ExtractSchemaCommand)
    const projectRoot = await this.getProjectRoot()

    await extractSchema({
      flags,
      output: this.output,
      projectRoot,
    })
  }
}
