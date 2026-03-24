import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {devAction} from '../actions/dev/devAction.js'
import {devDebug} from '../actions/dev/devDebug.js'
import {determineIsApp} from '../util/determineIsApp.js'

export class DevCommand extends SanityCommand<typeof DevCommand> {
  static override description =
    'Starts a local development server for Sanity Studio with live reloading'

  static override examples = [
    '<%= config.bin %> <%= command.id %> --host=0.0.0.0',
    '<%= config.bin %> <%= command.id %> --port=1942',
  ]

  static override flags = {
    'auto-updates': Flags.boolean({
      allowNo: true,
      description: 'Automatically update Sanity Studio dependencies.',
    }),
    host: Flags.string({
      description: '[default: localhost] The local network interface at which to listen.',
    }),
    port: Flags.string({
      description: '[default: 3333] TCP port to start server on.',
    }),
  }

  public async run(): Promise<{close?: () => Promise<void>}> {
    const {flags} = await this.parse(DevCommand)

    const workDir = (await this.getProjectRoot()).directory
    const cliConfig = await this.getCliConfig()
    const isApp = determineIsApp(cliConfig)

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
