import {Args, Flags} from '@oclif/core'
import {type CliConfig, exitCodes, SanityCommand} from '@sanity/cli-core'
import {type UndeployAdapter} from '@sanity/cli-core/undeploy'
import {getWorkbench, resolveWorkbenchConfig} from '@sanity/workbench-cli/deploy'
import {createWorkbenchUndeployAdapter} from '@sanity/workbench-cli/undeploy'

import {checkBlueprintUndeploy} from '../actions/deploy/blueprintManaged.js'
import {
  createAppUndeployAdapter,
  createStudioUndeployAdapter,
} from '../actions/undeploy/adapters.js'
import {runUndeploy} from '../actions/undeploy/runUndeploy.js'
import {type BlueprintScope} from '../services/blueprintOwnership.js'
import {getAppId} from '../util/appId.js'
import {getBlueprintCliContext} from '../util/blueprintCliContext.js'
import {determineIsApp} from '../util/determineIsApp.js'

export class UndeployCommand extends SanityCommand<typeof UndeployCommand> {
  static override args = {
    appId: Args.string({
      description:
        'ID of the application to undeploy. Overrides `deployment.appId` in sanity.cli.ts',
    }),
  }

  static override description = 'Removes the deployed Sanity Studio/App from Sanity hosting'

  static override enableJsonFlag = true

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

    const blueprint = await getBlueprintCliContext()
    if (blueprint && (!args.appId || (!blueprint.projectId && !blueprint.organizationId))) {
      this.error(
        'App ID and scope are required in Blueprint mode. Pass the app ID and select a profile with its project or organization.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }
    const projectConfig = await this.getCliConfig()
    const isApp = blueprint ? !blueprint.projectId : determineIsApp(projectConfig)
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

    const organizationId = cliConfig.app?.organizationId
    const projectId = cliConfig.api?.projectId
    let scope: BlueprintScope | undefined
    if (isApp && organizationId) scope = {id: organizationId, type: 'organization'}
    else if (projectId) scope = {id: projectId, type: 'project'}
    const kind = config ? 'mediaLibrary' : adapter.type

    await runUndeploy(
      {
        checkTarget: async (target) => {
          const appId = target?.id ?? getAppId(cliConfig)
          const ids = target?.deletes === 'config' ? (target.configs?.map(({id}) => id) ?? []) : []
          if (target?.deletes !== 'config' && appId) ids.push(appId)
          if (!target && ids.length === 0) return
          const application = target?.application
          const targetScope = getDeploymentScope(application, isApp) ?? scope
          return checkBlueprintUndeploy({
            directory: process.cwd(),
            getProjectRoot: async () => (await this.getProjectRoot()).directory,
            ids,
            kind,
            scope: targetScope,
            slug: getDeploymentSlug(application),
          })
        },
        flags,
        isUnattended: this.isUnattended(),
        output: this.output,
      },
      adapter,
    )
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

function getDeploymentScope(
  application: object | undefined,
  isApp: boolean,
): BlueprintScope | undefined {
  if (!application) return
  if (
    isApp &&
    'organizationId' in application &&
    typeof application.organizationId === 'string' &&
    application.organizationId
  ) {
    return {id: application.organizationId, type: 'organization'}
  }
  if (
    !isApp &&
    'projectId' in application &&
    typeof application.projectId === 'string' &&
    application.projectId
  ) {
    return {id: application.projectId, type: 'project'}
  }
}

function getDeploymentSlug(application: object | undefined): string | undefined {
  if (!application) return
  if ('slug' in application && typeof application.slug === 'string') return application.slug
  if ('appHost' in application && typeof application.appHost === 'string')
    return application.appHost
}
