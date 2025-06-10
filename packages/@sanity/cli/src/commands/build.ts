import {Args, Flags} from '@oclif/core'

import {buildApp} from '../actions/build/buildApp.js'
import {buildStudio} from '../actions/build/buildStudio.js'
import {shouldAutoUpdate} from '../actions/build/shouldAutoUpdate.js'
import {SanityCliCommand} from '../BaseCommand.js'
import {determineIsApp} from '../util/determineIsApp.js'

export class BuildCommand extends SanityCliCommand<typeof BuildCommand> {
  static override args = {
    outputDir: Args.directory({description: 'Output directory'}),
  }

  static override description = 'Builds the Sanity Studio configuration into a static bundle'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --no-minify --source-maps',
  ]

  static override flags = {
    'auto-updates': Flags.boolean({
      allowNo: true,
      description: 'Enable/disable auto updates of studio versions',
    }),
    minify: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Enable/disable minifying of built bundles',
    }),
    'source-maps': Flags.boolean({
      allowNo: true,
      default: false,
      description: 'Enable source maps for built bundles (increases size of bundle)',
    }),
    stats: Flags.boolean({
      default: false,
      description: 'Show stats about the built bundles',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description:
        'Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults',
    }),
  }

  public async run(): Promise<void> {
    const cliConfig = await this.getCliConfig()

    const {flags} = await this.parse(BuildCommand)

    const isApp = determineIsApp(cliConfig)

    const output = {
      error: this.error.bind(this),
      log: this.log.bind(this),
      warn: this.warn.bind(this),
    }
    const workDir = (await this.getProjectRoot()).directory

    const autoUpdatesEnabled = shouldAutoUpdate({cliConfig, flags})

    if (isApp) {
      buildApp({autoUpdatesEnabled, cliConfig, flags, outDir: this.args.outputDir, output, workDir})
    } else {
      buildStudio({
        autoUpdatesEnabled,
        cliConfig,
        flags,
        outDir: this.args.outputDir,
        output,
        workDir,
      })
    }
  }
}
