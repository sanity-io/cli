import {Args, Flags} from '@oclif/core'
import {type CliConfig, exitCodes, SanityCommand} from '@sanity/cli-core'
import {type UndeployAdapter} from '@sanity/cli-core/undeploy'
import {getWorkbench, resolveWorkbenchConfig} from '@sanity/workbench-cli/deploy'
import {createWorkbenchUndeployAdapter} from '@sanity/workbench-cli/undeploy'

import {
  createAppUndeployAdapter,
  createStudioUndeployAdapter,
} from '../actions/undeploy/adapters.js'
import {runUndeploy} from '../actions/undeploy/runUndeploy.js'
import {getAppId} from '../util/appId.js'
import {determineIsApp} from '../util/determineIsApp.js'

export class UndeployCommand extends SanityCommand<typeof UndeployCommand> {
  static override args = {
    appId: Args.string({
      description:
        'ID of the application to undeploy. Overrides `deployment.appId` in sanity.cli.ts',
    }),
  }

  static override description = 'Removes the deployed Sanity Studio/App from Sanity hosting'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Undeploy the studio or application after confirming',
    },
    {
      command: '<%= config.bin %> <%= command.id %> abc123',
      description: 'Undeploy the studio or application with the given ID',
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
    const {args, flags} = await this.parse(UndeployCommand)

    const projectConfig = await this.getCliConfig()
    const isApp = determineIsApp(projectConfig)
    if (args.appId) this.warnIfOverridingConfig(args.appId, projectConfig, isApp)
    // An explicit ID stands in for `deployment.appId`, which every adapter
    // already prefers over `studioHost` and the deprecated `app.id`.
    const cliConfig = args.appId
      ? {...projectConfig, deployment: {...projectConfig.deployment, appId: args.appId}}
      : projectConfig

    // Workbench apps and configs deploy through Brett, so they undeploy through
    // it too; plain projects keep the user-applications backend.
    const workbench = getWorkbench(cliConfig)
    const config = resolveWorkbenchConfig(cliConfig)
    if (args.appId && config) {
      this.error('An app ID cannot be used to undeploy a config. Run without the argument.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    const adapter: UndeployAdapter =
      workbench || config
        ? createWorkbenchUndeployAdapter({
            appId: getAppId(cliConfig),
            config: config ?? undefined,
            organizationId: cliConfig.app?.organizationId,
            type: isApp ? 'coreApp' : 'studio',
            workbench: workbench ?? undefined,
          })
        : isApp
          ? createAppUndeployAdapter(cliConfig)
          : createStudioUndeployAdapter(cliConfig)

    await runUndeploy({flags, isUnattended: this.isUnattended(), output: this.output}, adapter)
  }

  private warnIfOverridingConfig(appId: string, cliConfig: CliConfig, isApp: boolean): void {
    const configuredAppId = getAppId(cliConfig)
    if (configuredAppId) {
      if (configuredAppId !== appId) {
        this.output.warn(
          `Using app ID "${appId}" instead of "${configuredAppId}" configured in sanity.cli.ts`,
        )
      }
      return
    }

    if (!isApp && cliConfig.studioHost) {
      this.output.warn(
        `Using app ID "${appId}" instead of studio host "${cliConfig.studioHost}" configured in sanity.cli.ts`,
      )
    }
  }
}
