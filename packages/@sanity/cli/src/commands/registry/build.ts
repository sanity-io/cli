import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {buildRegistryManifest} from '../../actions/registry/buildRegistryManifest.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'

const debug = subdebug('registry:build')

export class BuildRegistryCommand extends SanityCommand<typeof BuildRegistryCommand> {
  static override args = {
    directory: Args.string({
      default: '.',
      description: 'Path to registry authoring directory',
      required: false,
    }),
  }

  static override description =
    'Generate sanity-registry.json from registry.source.ts/json and file conventions'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Build manifest from current directory',
    },
    {
      command: '<%= config.bin %> <%= command.id %> ./registries/core',
      description: 'Build manifest for a specific registry package directory',
    },
    {
      command: '<%= config.bin %> <%= command.id %> ./registries/core --dry-run',
      description: 'Preview generated manifest without writing file',
    },
  ]

  static override flags = {
    'dry-run': Flags.boolean({
      default: false,
      description: 'Print generated manifest without writing sanity-registry.json',
    }),
  }

  static override hiddenAliases: string[] = ['registries:build']

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(BuildRegistryCommand)
    debug('Building registry manifest in: %s', args.directory)

    try {
      const result = await buildRegistryManifest({
        dryRun: flags['dry-run'],
        registryDirectory: args.directory,
      })

      this.log('')
      if (flags['dry-run']) {
        this.log('Generated manifest (dry run):')
        this.log(JSON.stringify(result.manifest, null, 2))
      } else {
        this.log(`Wrote ${result.manifestPath}`)
      }
      this.log(`Scanned conventions: ${result.scannedDirectories.join(', ')}`)
      this.log('')
    } catch (error) {
      this.error(`Registry build failed:\n${getErrorMessage(error)}`, {exit: 1})
    }
  }
}
