import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {addRegistry} from '../../actions/registry/addRegistry.js'
import {type AddRegistryResult} from '../../actions/registry/types.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'

const debug = subdebug('registry:add')

export class AddRegistryCommand extends SanityCommand<typeof AddRegistryCommand> {
  static override args = {
    source: Args.string({
      description: 'Git repository URL (or local path with --local) to a registry',
      required: true,
    }),
  }

  static override description = 'Add shared registry files to the current Sanity project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> https://github.com/acme/sanity-registry.git',
      description: 'Install from a Git repository',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> https://github.com/acme/sanity-registry.git --path registries/studio-core',
      description: 'Install from a subdirectory in the repository',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> https://github.com/acme/sanity-registry.git --ref main --dry-run',
      description: 'Preview planned changes without writing files',
    },
    {
      command: '<%= config.bin %> <%= command.id %> ./examples/registry-demo --local --dry-run',
      description: 'Install from a local registry directory for testing',
    },
  ]

  static override flags = {
    'dry-run': Flags.boolean({
      default: false,
      description: 'Preview changes without writing files',
    }),
    local: Flags.boolean({
      default: false,
      description: 'Treat source as a local directory path (skip git clone)',
    }),
    overwrite: Flags.boolean({
      default: false,
      description: 'Overwrite files that already exist',
    }),
    path: Flags.string({
      description: 'Path to registry directory within the repository',
      helpValue: 'registries/studio-core',
    }),
    ref: Flags.string({
      description: 'Git ref (branch, tag, or commit) to install from',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip interactive prompts and apply deterministic changes only',
    }),
  }

  static override hiddenAliases: string[] = ['registries:add']

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(AddRegistryCommand)
    const {source} = args

    debug('Running registry add with source: %s', source)

    try {
      const result = await addRegistry({
        dryRun: flags['dry-run'],
        local: flags.local,
        output: this.output,
        overwrite: flags.overwrite,
        projectRoot: (await this.getProjectRoot()).directory,
        ref: flags.ref,
        source,
        subdir: flags.path,
        unattended: this.isUnattended(),
      })

      this.printResult(result)
    } catch (error) {
      this.error(`Registry installation failed:\n${getErrorMessage(error)}`, {exit: 1})
    }
  }

  private printResult(result: AddRegistryResult): void {
    this.log('')
    this.log(
      `${result.dryRun ? 'Dry run' : 'Registry install'} completed for "${result.manifest.name}"`,
    )
    this.log(`Project root: ${result.projectRoot}`)
    this.log('')

    if (result.addedFiles.length > 0) {
      this.log(`Added files (${result.addedFiles.length}):`)
      for (const file of result.addedFiles) this.log(`  - ${file}`)
      this.log('')
    }

    if (result.updatedFiles.length > 0) {
      this.log(`Updated files (${result.updatedFiles.length}):`)
      for (const file of result.updatedFiles) this.log(`  - ${file}`)
      this.log('')
    }

    if (result.skippedFiles.length > 0) {
      this.log(`Skipped files (${result.skippedFiles.length}):`)
      for (const item of result.skippedFiles) this.log(`  - ${item.file}: ${item.reason}`)
      this.log('')
    }

    if (result.manualSteps.length > 0) {
      this.log('Manual follow-up required:')
      for (const step of result.manualSteps) this.log(`  - ${step}`)
      this.log('')
    }
  }
}
