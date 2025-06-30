import {confirm} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {isInteractive, SanityCommand} from '@sanity/cli-core'
import chalk from 'chalk'

import {devAction} from '../actions/dev/devAction.js'

export class DevCommand extends SanityCommand<typeof DevCommand> {
  static override description =
    'Starts a local development server for Sanity Studio with live reloading'

  static override examples = [
    '<%= config.bin %> <%= command.id %> --host=0.0.0.0',
    '<%= config.bin %> <%= command.id %> --port=1942',
    '<%= config.bin %> <%= command.id %> --load-in-dashboard',
  ]

  static override flags = {
    'auto-updates': Flags.boolean({
      allowNo: true,
      description: 'Automatically update Sanity Studio dependencies.',
    }),
    host: Flags.string({
      default: 'localhost',
      description: 'The local network interface at which to listen.',
    }),
    'load-in-dashboard': Flags.boolean({
      allowNo: true,
      default: false,
      description: 'Load the dev server in the Sanity dashboard.',
    }),
    port: Flags.string({
      default: '3333',
      description: 'TCP port to start server on.',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DevCommand)

    const workDir = (await this.getProjectRoot()).directory
    const cliConfig = await this.getCliConfig()

    try {
      await devAction({
        apiClient: this.getGlobalApiClient,
        cliConfig,
        flags,
        output: this.output,
        workDir,
      })
    } catch (error) {
      this.output.log(chalk.red.bgBlack(`Failed to start dev server: ${error.message}`, error))

      if (error.name === 'MISSING_DEPENDENCIES') {
        const shouldInstall =
          isInteractive &&
          (await confirm({
            message: 'Missing dependencies detected. Would you like to install them?',
          }))

        if (shouldInstall) {
          // TODO: Implement dependency installation
          this.output.log(chalk.green.bgBlack('Installing dependencies...'))
        } else {
          process.exit(1)
        }
      } else {
        // Re-throw for unexpected errors
        throw error
      }
    }
  }
}
