import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import {type UndeployAdapter} from '@sanity/cli-core/undeploy'
import {getWorkbench} from '@sanity/workbench-cli/deploy'
import {createWorkbenchUndeployAdapter} from '@sanity/workbench-cli/undeploy'

import {
  createAppUndeployAdapter,
  createStudioUndeployAdapter,
} from '../actions/undeploy/adapters.js'
import {runUndeploy} from '../actions/undeploy/runUndeploy.js'
import {getAppId} from '../util/appId.js'
import {determineIsApp} from '../util/determineIsApp.js'

export class UndeployCommand extends SanityCommand<typeof UndeployCommand> {
  static override description = 'Removes the deployed Sanity Studio/App from Sanity hosting'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Undeploy the studio or application after confirming',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --dry-run',
      description: 'Report what would be undeployed without deleting anything',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json --yes',
      description: 'Undeploy without prompting and report the result as JSON',
    },
  ]

  static override flags = {
    'dry-run': Flags.boolean({
      default: false,
      description: 'Report what would be undeployed without deleting anything',
    }),
    json: Flags.boolean({
      char: 'j',
      default: false,
      description: 'Output the result as JSON',
    }),
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

    // Workbench apps deploy through Brett, so they undeploy through it too;
    // plain projects keep the user-applications backend.
    const workbench = getWorkbench(cliConfig)
    const adapter: UndeployAdapter = workbench
      ? createWorkbenchUndeployAdapter({
          appId: getAppId(cliConfig),
          organizationId: cliConfig.app?.organizationId,
          type: isApp ? 'coreApp' : 'studio',
          workbench,
        })
      : isApp
        ? createAppUndeployAdapter(cliConfig)
        : createStudioUndeployAdapter(cliConfig)

    await runUndeploy({flags, isUnattended: this.isUnattended(), output: this.output}, adapter)
  }
}
