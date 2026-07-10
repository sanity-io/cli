import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'
import {type CliConfig} from '@sanity/cli-core/types'
import {isWorkbenchApp} from '@sanity/workbench-cli'

import {devAction} from '../actions/dev/devAction.js'
import {devDebug} from '../actions/dev/devDebug.js'
import {determineIsApp} from '../util/determineIsApp.js'

/**
 * Workbench apps never load in the Sanity dashboard, so `--load-in-dashboard`
 * has no effect for them. The flag is defaulted later in `run`, so an
 * `undefined` value here still means the user never passed it.
 */
export function shouldWarnDashboardFlagIgnored(
  cliConfig: CliConfig | undefined,
  loadInDashboard: boolean | undefined,
): boolean {
  return isWorkbenchApp(cliConfig?.app) && loadInDashboard !== undefined
}

export class DevCommand extends SanityCommand<typeof DevCommand> {
  static override description = 'Start a local development server with live reloading'

  static override examples = [
    '<%= config.bin %> <%= command.id %> --host=0.0.0.0',
    '<%= config.bin %> <%= command.id %> --port=1942',
    '<%= config.bin %> <%= command.id %> --load-in-dashboard',
  ]

  static override flags = {
    'auto-updates': Flags.boolean({
      allowNo: true,
      description: 'Automatically update Sanity Studio dependencies',
    }),
    host: Flags.string({
      description: 'Local network interface to listen on (default: localhost)',
    }),
    'load-in-dashboard': Flags.boolean({
      allowNo: true,
      description: 'Load the app/studio in the Sanity dashboard',
    }),
    port: Flags.string({
      description: 'TCP port to start server on (default: 3333)',
    }),
  }

  public async run(): Promise<{close?: () => Promise<void>}> {
    const {flags} = await this.parse(DevCommand)

    const workDir = (await this.getProjectRoot()).directory
    const cliConfig = await this.getCliConfig()
    const isApp = determineIsApp(cliConfig)

    if (shouldWarnDashboardFlagIgnored(cliConfig, flags['load-in-dashboard'])) {
      this.output.warn(
        'Ignoring --load-in-dashboard: workbench apps do not load in the Sanity dashboard',
      )
    }

    // load-in-dashboard is defaulted to true for apps.
    if (isApp && flags['load-in-dashboard'] === undefined) {
      flags['load-in-dashboard'] = true
    } else if (flags['load-in-dashboard'] === undefined) {
      // For non-apps, load-in-dashboard is defaulted to false.
      flags['load-in-dashboard'] = false
    }

    try {
      const result = await devAction({
        cliConfig,
        flags,
        isApp,
        output: this.output,
        workDir,
      })
      return result
    } catch (error) {
      devDebug(`Failed to start dev server`, error)
      this.output.error(
        styleText(['red', 'bgBlack'], `Failed to start dev server: ${error.message}`),
        {
          exit: 1,
        },
      )
    }
  }
}
