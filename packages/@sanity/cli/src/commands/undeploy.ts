import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {
  createAppUndeployAdapter,
  createStudioUndeployAdapter,
} from '../actions/undeploy/adapters.js'
import {runUndeploy} from '../actions/undeploy/runUndeploy.js'
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
  ]

  static override flags = {
    'dry-run': Flags.boolean({
      default: false,
      description: 'Report what would be undeployed without deleting anything',
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
    const adapter = determineIsApp(cliConfig)
      ? createAppUndeployAdapter(cliConfig)
      : createStudioUndeployAdapter(cliConfig)

    await runUndeploy({flags, output: this.output}, adapter)
  }
}
