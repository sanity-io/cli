import {Args, Flags} from '@oclif/core'
import {type CliConfig, exitCodes, SanityCommand} from '@sanity/cli-core'
import {type UndeployAdapter} from '@sanity/cli-core/undeploy'
import {getWorkbench, resolveWorkbenchConfig} from '@sanity/workbench-cli/deploy'
import {createWorkbenchUndeployAdapter} from '@sanity/workbench-cli/undeploy'

import {
  type BlueprintScope,
  getBlueprintResourceProblem,
  resourceAttachmentId,
  resourceValue,
} from '../actions/blueprints/guardResource.js'
import {
  createAppUndeployAdapter,
  createStudioUndeployAdapter,
} from '../actions/undeploy/adapters.js'
import {runUndeploy} from '../actions/undeploy/runUndeploy.js'
import {getAppId} from '../util/appId.js'
import {getCheckoutBlueprint} from '../util/checkoutBlueprint.js'
import {determineIsApp} from '../util/determineIsApp.js'
import {getOrganizationFlag, getProjectIdFlag, getWithBlueprintsFlag} from '../util/sharedFlags.js'

const BLUEPRINT_DEPLOYMENT_TYPES = {
  coreApp: {label: 'app', type: 'sanity.application'},
  mediaLibrary: {label: 'Media Library config', type: 'sanity.installation.config'},
  studio: {label: 'Studio', type: 'sanity.studio'},
} as const

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
    ...getWithBlueprintsFlag(),
    ...getProjectIdFlag({
      dependsOn: ['with-blueprints'],
      exclusive: ['organization'],
      semantics: 'specify',
    }),
    ...getOrganizationFlag({
      dependsOn: ['with-blueprints'],
      exclusive: ['project'],
      semantics: 'specify',
    }),
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

    const withBlueprints = flags['with-blueprints']
    let projectConfig = withBlueprints ? await this.tryGetCliConfig() : await this.getCliConfig()
    if (withBlueprints) {
      const scope = this.getBlueprintScope(projectConfig)
      if (scope) {
        if (!args.appId) {
          this.error('App ID is required. Pass it as the `<appId>` argument.', {
            exit: exitCodes.USAGE_ERROR,
          })
        }
        projectConfig =
          scope.type === 'project'
            ? {api: {projectId: scope.id}}
            : {app: {organizationId: scope.id}}
      } else if (!projectConfig.api?.projectId && !projectConfig.app?.organizationId) {
        this.error(
          'Project or organization is required. Try again with `--project <project-id>` or `--organization <organization-id>`.',
          {exit: exitCodes.USAGE_ERROR},
        )
      }
    }
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

    const organizationId = cliConfig.app?.organizationId
    const projectId = cliConfig.api?.projectId
    let scope: BlueprintScope | undefined
    if (isApp && organizationId) scope = {id: organizationId, type: 'organization'}
    else if (projectId) scope = {id: projectId, type: 'project'}
    const kind = config ? 'mediaLibrary' : adapter.type

    await runUndeploy(
      {
        checkTarget: withBlueprints
          ? async (target) => {
              const applicationScope = getDeploymentScope(target?.application, isApp)
              if (
                scope &&
                applicationScope &&
                (scope.type !== applicationScope.type || scope.id !== applicationScope.id)
              ) {
                return {
                  exitCode: exitCodes.USAGE_ERROR,
                  message: `Application "${target?.id}" belongs to ${applicationScope.type} "${applicationScope.id}". Check the application ID and scope before retrying.`,
                  status: 'fail',
                }
              }
              const targetScope = applicationScope ?? scope
              if (!targetScope) return
              const appId = target?.id ?? getAppId(cliConfig)
              if (target?.deletes === 'config' && !target.configs) {
                return {
                  exitCode: exitCodes.RUNTIME_ERROR,
                  message: 'Could not verify the Media Library config snapshots to undeploy.',
                  status: 'fail',
                }
              }
              const ids =
                target?.deletes === 'config' ? (target.configs?.map(({id}) => id) ?? []) : []
              if (target?.deletes !== 'config' && appId) ids.push(appId)
              const {label, type} = BLUEPRINT_DEPLOYMENT_TYPES[kind]
              const slug = getDeploymentSlug(target?.application)
              for (const id of ids) {
                const problem = await getBlueprintResourceProblem(
                  targetScope,
                  {
                    id,
                    label: `${label} "${id}"`,
                    matches: (resource, blueprint) =>
                      resourceAttachmentId(resource) === id ||
                      Boolean(
                        slug &&
                        'slug' in resource &&
                        resourceValue(resource.slug, blueprint) === slug,
                      ),
                    type,
                  },
                  'delete',
                )
                if (problem) return {...problem, status: 'fail'}
              }
            }
          : undefined,
        flags,
        isUnattended: this.isUnattended(),
        output: this.output,
      },
      adapter,
    )
  }

  private getBlueprintScope(config: CliConfig): BlueprintScope | undefined {
    const {organization, project} = this.flags
    if (organization) return {id: organization, type: 'organization'}
    if (project) return {id: project, type: 'project'}
    if (config.api?.projectId || config.app?.organizationId) return
    const checkout = getCheckoutBlueprint()
    if (checkout) return {id: checkout.scopeId, type: checkout.scopeType}
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
