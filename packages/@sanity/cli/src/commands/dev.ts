import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import chalk from 'chalk'

import {devAction} from '../actions/dev/devAction.js'
import {devDebug} from '../actions/dev/devDebug.js'
import {determineIsApp} from '../util/determineIsApp.js'

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
      description: 'Load the dev server in the Sanity dashboard.',
    }),
    port: Flags.string({
      default: '3333',
      description: 'TCP port to start server on.',
    }),
  }

  public async run(): Promise<{close?: () => Promise<void>}> {
    const {flags} = await this.parse(DevCommand)

    const workDir = (await this.getProjectRoot()).directory
    const cliConfig = await this.getCliConfig()
    const isApp = determineIsApp(cliConfig)

    // load-in-dashboard is defaulted to true for apps.
    if (isApp && flags['load-in-dashboard'] === undefined) {
      flags['load-in-dashboard'] = true
    } else if (flags['load-in-dashboard'] === undefined) {
      // For non-apps, load-in-dashboard is defaulted to false.
      flags['load-in-dashboard'] = false
    }

    try {
      const result = await devAction({
        apiClient: this.getGlobalApiClient,
        cliConfig,
        flags,
        isApp,
        output: this.output,
        workDir,
      })
      return result
    } catch (error) {
      devDebug(`Failed to start dev server`, error)
      this.output.error(chalk.red.bgBlack(`Failed to start dev server: ${error.message}`), {
        exit: 1,
      })
    }
  }
}
