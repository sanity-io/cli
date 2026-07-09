import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip, type Gzip} from 'node:zlib'

import {formatSchemaValidation, SchemaExtractionError} from '@sanity/cli-build/_internal/extract'
import {exitCodes} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {
  type BrettWorkspace,
  buildExposes,
  deployStudio as deployWorkbenchStudio,
  getWorkbench,
} from '@sanity/workbench-cli/deploy'
import {type StudioManifest} from 'sanity'
import {pack} from 'tar-fs'

import {createDeployment, type UserApplication} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {NO_ORGANIZATION_ID, NO_PROJECT_ID} from '../../util/errorMessages.js'
import {buildStudio} from '../build/buildStudio.js'
import {createStudioUserApplication} from './createUserApplication.js'
import {
  checkAutoUpdates,
  checkBuild,
  checkPackageVersion,
  type CheckReporter,
  checkStudioTarget,
  type DeployTarget,
  verifyOutputDir,
} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {listDeploymentFiles, reportExposes} from './deploymentPlan.js'
import {type DeployResult, runDeploy} from './deployRunner.js'
import {deployStudioSchemasAndManifests} from './deployStudioSchemasAndManifests.js'
import {findUserApplicationForStudio} from './findUserApplication.js'
import {type DeployAppOptions} from './types.js'

const STUDIO_PACKAGE = 'sanity'

export function deployStudio(options: DeployAppOptions): Promise<void> {
  return runDeploy(options, {
    listFiles: ({flags, projectRoot, sourceDir}) =>
      flags.external ? Promise.resolve([]) : listDeploymentFiles(sourceDir, projectRoot.directory),
    run: runStudioDeployment,
    type: 'studio',
  })
}

/** Validates the deploy, extracts and uploads the schema, and ships the build. */
async function runStudioDeployment(
  options: DeployAppOptions,
  reporter: CheckReporter,
): Promise<DeployResult | void> {
  const {cliConfig, flags, output, sourceDir} = options
  const workDir = options.projectRoot.directory
  const isExternal = !!flags.external
  const workbench = getWorkbench(cliConfig)
  const isWorkbenchApp = workbench !== null
  const projectId = cliConfig.api?.projectId
  const organizationId = cliConfig.app?.organizationId
  const appId = getAppId(cliConfig)
  const dryRun = !!flags['dry-run']

  // A federated app deploys through Sanity's build/hosting pipeline, which
  // --external skips — fail before doing any other work.
  if (isExternal && isWorkbenchApp) {
    reporter.report({
      exitCode: exitCodes.USAGE_ERROR,
      message: 'Deploying a federated application to an external host is not yet supported',
      solution: 'Remove the --external flag to deploy to Sanity hosting',
      status: 'fail',
    })
  }

  const appTitle = workbench
    ? flags.title?.trim() || cliConfig.app?.title?.trim() || workbench.name
    : ''

  const isAutoUpdating = checkAutoUpdates(reporter, {cliConfig, flags})

  const version = await checkPackageVersion(reporter, {
    moduleName: STUDIO_PACKAGE,
    workDir,
  })

  reporter.report(
    projectId
      ? {message: `Project: ${projectId}`, status: 'pass'}
      : {
          message: NO_PROJECT_ID,
          solution: 'Add `api.projectId` to sanity.cli.ts',
          status: 'fail',
        },
  )

  // Workbench studios deploy to Brett (which needs the org); plain studios
  // resolve/create on user-applications, unchanged.
  let application: UserApplication | null = null
  let studioCreated = false
  let studioTarget: DeployTarget | null = null
  if (workbench && !isExternal) {
    reporter.report(
      organizationId
        ? {message: `Organization: ${organizationId}`, status: 'pass'}
        : {
            message: NO_ORGANIZATION_ID,
            solution: 'Add `app.organizationId` to sanity.cli.ts',
            status: 'fail',
          },
    )
    // Both modes, so a bad appId fails before the build; its resolved URL feeds
    // the deploy result.
    studioTarget = await checkStudioTarget(reporter, {
      appId,
      isWorkbenchApp: true,
      studioHost: cliConfig.studioHost,
      title: appTitle,
    })
  } else {
    ;({application, created: studioCreated} = await resolveStudioApplication(options, {
      dryRun,
      reporter,
    }))
  }

  await checkBuild(reporter, {
    build: () =>
      buildStudio({
        autoUpdatesEnabled: isAutoUpdating,
        calledFromDeploy: true,
        cliConfig,
        flags,
        outDir: sourceDir,
        output,
        workDir,
      }),
    skipReason: studioBuildSkipReason({build: flags.build, isExternal}),
    successMessage: 'Studio built',
  })

  if (!isExternal) {
    await verifyOutputDir({isWorkbenchApp, reporter, sourceDir})
  }

  // Report the exposes deploying with the studio, both modes. External studios
  // host their own bundle, so nothing registers.
  const exposes = workbench && !isExternal ? reportExposes(reporter, workbench) : []

  // Dry run stops here — everything below mutates.
  if (dryRun) return

  // A real deploy has already exited if anything failed; landing here without a
  // resolved version means the deploy target was never resolved.
  if (!version) return

  const studioManifest = await uploadStudioSchema(options, {isExternal})
  // Workbench studios deploy to Brett; plain studios use user-applications.
  if (workbench && !isExternal && organizationId) {
    const {applicationId} = await deployWorkbenchStudio({
      appId,
      interfaces: buildExposes(workbench, {
        appName: workbench.name,
        appTitle,
        exposesAppView: true,
        version,
      }),
      isAutoUpdating,
      organizationId,
      output,
      projectId,
      sourceDir,
      studioHost: cliConfig.studioHost,
      title: appTitle,
      version,
      workspaces: toWorkspaces(studioManifest),
    })
    logWorkbenchStudioDeployed({applicationId, cliConfig, output})
    return {
      applicationType: 'studio',
      applicationVersion: version,
      ...(exposes.length > 0 ? {exposes} : {}),
      target: {
        action: appId ? 'update' : 'create',
        applicationId,
        title: appTitle,
        url: studioTarget?.url ?? null,
      },
    }
  }

  if (!application) return
  const location = await shipStudioDeployment({
    application,
    isAutoUpdating,
    isExternal,
    options,
    studioManifest,
    version,
  })

  return {
    applicationType: 'studio',
    applicationVersion: version,
    target: {
      action: studioCreated ? 'create' : 'update',
      applicationId: application.id,
      title: application.title ?? null,
      url: location,
    },
  }
}

/**
 * Finds the application a real deploy targets, registering a studio host when
 * none is configured. A dry run resolves and reports the target read-only instead.
 */
async function resolveStudioApplication(
  options: DeployAppOptions,
  {dryRun, reporter}: {dryRun: boolean; reporter: CheckReporter},
): Promise<{application: UserApplication | null; created: boolean}> {
  const {cliConfig, flags, output} = options
  const isExternal = !!flags.external
  const appId = getAppId(cliConfig)
  // Sets the title on a newly registered studio; blank falls back to undefined
  const title = flags.title?.trim() || undefined

  if (dryRun) {
    await checkStudioTarget(reporter, {
      appId,
      isExternal,
      projectId: cliConfig.api?.projectId,
      studioHost: cliConfig.studioHost,
      title,
      urlFlag: flags.url,
    })
    return {application: null, created: false}
  }

  const projectId = cliConfig.api?.projectId ?? ''
  // `created` is true when a configured-but-unregistered host was just registered.
  const {application, created} = await findUserApplicationForStudio({
    appId,
    isExternal,
    output,
    projectId,
    studioHost: cliConfig.studioHost,
    title,
    unattended: !!flags.yes,
    urlFlag: flags.url,
  })

  if (!application) {
    if (isExternal) {
      output.log('Your project has not been registered with an external studio URL.')
      output.log('Please enter the full URL where your studio is hosted.')
    } else {
      output.log('Your project has not been assigned a studio hostname.')
      output.log('To deploy your Sanity Studio to our hosted sanity.studio service,')
      output.log('you will need one. Please enter the subdomain you want to use.')
    }

    const registered = await createStudioUserApplication({
      projectId,
      title,
      urlType: isExternal ? 'external' : 'internal',
    })
    deployDebug('Created user application', registered)
    return {application: registered, created: true}
  }

  deployDebug('Found user application', application)
  return {application, created}
}

/** Extracts the studio schema and manifest and uploads them to the schema store. */
async function uploadStudioSchema(
  options: DeployAppOptions,
  {isExternal}: {isExternal: boolean},
): Promise<StudioManifest | null> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options

  let studioManifest: StudioManifest | null = null
  try {
    studioManifest = await deployStudioSchemasAndManifests(
      {
        configPath: projectRoot.path,
        isExternal,
        outPath: `${sourceDir}/static`,
        projectId: cliConfig.api?.projectId ?? '',
        schemaRequired: flags['schema-required'],
        verbose: flags.verbose,
        workDir: projectRoot.directory,
      },
      output,
    )
  } catch (error) {
    deployDebug('Error deploying studio schemas and manifests', error)
    if (error instanceof SchemaExtractionError) {
      output.error(formatSchemaValidation(error.validation || []), {exit: 1})
    }
    output.error(`Error deploying studio schemas and manifests: ${error}`, {exit: 1})
  }

  if (!studioManifest) {
    output.error('Failed to generate studio manifest. Please check your schemas and manifests.', {
      exit: 1,
    })
  }

  return studioManifest
}

async function shipStudioDeployment({
  application,
  isAutoUpdating,
  isExternal,
  options,
  studioManifest,
  version,
}: {
  application: UserApplication
  isAutoUpdating: boolean
  isExternal: boolean
  options: DeployAppOptions
  studioManifest: StudioManifest | null
  version: string
}): Promise<string> {
  const {cliConfig, output, sourceDir} = options

  let tarball: Gzip | undefined
  if (!isExternal) {
    tarball = pack(dirname(sourceDir), {entries: [basename(sourceDir)]}).pipe(createGzip())
  }

  const spin = spinner(isExternal ? 'Registering studio' : 'Deploying to sanity.studio').start()
  let location: string
  try {
    ;({location} = await createDeployment({
      applicationId: application.id,
      isApp: false,
      isAutoUpdating,
      manifest: studioManifest,
      projectId: cliConfig.api?.projectId,
      tarball,
      version,
    }))
  } catch (error) {
    spin.fail()
    throw error
  }
  spin.succeed()

  const named = application.title ? ` — "${application.title}"` : ''
  output.log(
    isExternal
      ? `\nSuccess! Studio registered${named}`
      : `\nSuccess! Studio deployed to ${styleText('cyan', location)}${named}`,
  )

  if (getAppId(cliConfig)) return location

  const example = `Example:
export default defineCliConfig({
  //…
  deployment: {
    ${styleText('cyan', `appId: '${application.id}'`)},
  },
  //…
})`
  output.log(`\nAdd ${styleText('cyan', `appId: '${application.id}'`)}`)
  output.log(`to the \`deployment\` section in sanity.cli.js or sanity.cli.ts`)
  output.log(`to avoid prompting for application id on next deploy.`)
  output.log(`\n${example}`)

  return location
}

function toWorkspaces(manifest: StudioManifest | null): BrettWorkspace[] {
  return (manifest?.workspaces ?? []).map((workspace) => ({
    basePath: workspace.basePath,
    dataset: workspace.dataset,
    icon: workspace.icon,
    name: workspace.name,
    projectId: workspace.projectId,
    subtitle: workspace.subtitle,
    title: workspace.title,
  }))
}

/** Renders the workbench studio's deploy result; the appId hint shows only when none is configured. */
function logWorkbenchStudioDeployed({
  applicationId,
  cliConfig,
  output,
}: {
  applicationId: string
  cliConfig: DeployAppOptions['cliConfig']
  output: DeployAppOptions['output']
}): void {
  output.log(`\nSuccess! Studio deployed`)
  if (getAppId(cliConfig)) return

  output.log(`\nAdd ${styleText('cyan', `appId: '${applicationId}'`)}`)
  output.log(`to the \`deployment\` section in sanity.cli.js or sanity.cli.ts`)
  output.log(`to avoid prompting for application id on next deploy.`)
}

function studioBuildSkipReason({build, isExternal}: {build: boolean; isExternal: boolean}) {
  if (isExternal) return 'Build skipped for externally hosted studios'
  if (!build) return 'Build skipped (--no-build) — validating existing output directory'
  return
}
