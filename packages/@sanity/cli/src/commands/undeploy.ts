import {Flags} from '@oclif/core'

import {undeployApp} from '../actions/undeploy/appUndeploy.js'
import {undeployStudio} from '../actions/undeploy/studioUndeploy.js'
import {SanityCliCommand} from '../BaseCommand.js'
import {determineIsApp} from '../util/determineIsApp.js'

const UNDEPLOY_API_VERSION = 'v2024-08-01'

export class UndeployCommand extends SanityCliCommand<typeof UndeployCommand> {
  static override description = 'Removes the deployed Sanity Studio from Sanity hosting'

  static override flags = {
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description:
        'Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(UndeployCommand)

    const cliConfig = await this.getCliConfig()
    const isApp = determineIsApp(cliConfig)

    const client = await this.getGlobalApiClient({
      apiVersion: UNDEPLOY_API_VERSION,
      requireUser: true,
    })

    const log = this.log.bind(this)

    await (isApp
      ? undeployApp({cliConfig, client, flags, log})
      : undeployStudio({cliConfig, client, flags, log}))
  }
}
