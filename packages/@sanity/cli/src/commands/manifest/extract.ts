import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {manifestDebug} from '../../actions/manifest/debug.js'
import {extractManifest} from '../../actions/manifest/extractManifest.js'
import {formatSchemaValidation} from '../../actions/schema/formatSchemaValidation.js'
import {SchemaExtractionError} from '../../actions/schema/utils/SchemaExtractionError.js'

const description = `
Extracts the studio configuration as one or more JSON manifest files.

**Note**: This command is experimental and subject to change. It is currently intended for use with Create only.
`.trim()

export class ExtractManifestCommand extends SanityCommand<typeof ExtractManifestCommand> {
  static override description = description

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Extracts manifests',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --path /public/static',
      description: 'Extracts manifests into /public/static',
    },
  ]

  static override flags = {
    path: Flags.string({
      default: 'dist/static',
      description: 'Optional path to specify destination directory of the manifest files',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ExtractManifestCommand)

    try {
      await extractManifest(flags.path)
    } catch (error) {
      manifestDebug('Error extracting manifest in command', error)
      if (
        error instanceof SchemaExtractionError &&
        error.validation &&
        error.validation.length > 0
      ) {
        this.output.log(formatSchemaValidation(error.validation))
        this.exit(1)
      }

      this.error(
        `Failed to extract manifest:\n${error instanceof Error ? error.message : String(error)}`,
        {exit: 1},
      )
    }
  }
}
