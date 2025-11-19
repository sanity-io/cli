import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {extractManifestSafe} from '../../actions/manifest/extractManifest.js'

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
      default: '/dist/static',
      description: 'Optional path to specify destination directory of the manifest files',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ExtractManifestCommand)
    const workDir = (await this.getProjectRoot()).directory

    try {
      await extractManifestSafe({
        flags,
        output: this.output,
        workDir,
      })
    } catch (error) {
      this.error(`Failed to extract manifest:\n${error}`, {exit: 1})
    }
  }
}
