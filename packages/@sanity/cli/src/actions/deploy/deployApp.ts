import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip} from 'node:zlib'

import {exitCodes} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {
  buildExposes,
  deployConfig,
  deployCoreApp as deployWorkbenchCoreApp,
  getWorkbench,
  resolveInstallationId,
  summarizeConfig,
} from '@sanity/workbench-cli/deploy'
import {pack} from 'tar-fs'

import {
  createDeployment,
  updateUserApplication,
  type UserApplication,
  type UserApplicationResolved,
} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {EXTERNAL_APP_NOT_SUPPORTED, NO_ORGANIZATION_ID} from '../../util/errorMessages.js'
import {buildApp} from '../build/buildApp.js'
import {extractCoreAppManifest, resolveTitleUpdate} from '../manifest/extractCoreAppManifest.js'
import {type CoreAppManifest} from '../manifest/types.js'
import {createUserApplication, generateAppSlug} from './createUserApplication.js'
import {
  checkAppId,
  checkAppTarget,
  checkAutoUpdates,
  checkBuild,
  checkPackageVersion,
  type DeployCheckReporter,
  verifyOutputDir,
} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {listDeploymentFiles, reportExposes} from './deploymentPlan.js'
import {type DeployResult, runDeploy} from './deployRunner.js'
import {findUserApplication} from './findUserApplication.js'
import {type DeployAppOptions} from './types.js'
import {getCoreAppUrl} from './urlUtils.js'

const APP_PACKAGE = '@sanity/sdk-react'

export function deployApp(options: DeployAppOptions): Promise<void> {
  return runDeploy(options, {
    listFiles: ({projectRoot, sourceDir}) => listDeploymentFiles(sourceDir, projectRoot.directory),
    run: runAppDeployment,
    type: 'coreApp',
  })
}

/** Validates the deploy, syncs the title from the manifest, and ships the build. */
async function runAppDeployment(
  options: DeployAppOptions,
  reporter: DeployCheckReporter,
): Promise<DeployResult | void> {
  const {cliConfig, flags, output, sourceDir} = options
  const workDir = options.projectRoot.directory
  const organizationId = cliConfig.app?.organizationId
  const appId = getAppId(cliConfig)
  const workbench = getWorkbench(cliConfig)
  const dryRun = !!flags['dry-run']

  // A singleton (the Media Library) persists its config instead of hosting an
  // application; anything that exposes a view or service still ships one.
  const deploySingletonConfig = workbench?.deploySingletonConfig ?? false
  const deployApplication = !workbench || workbench.hasInterfaces

  const appTitle = workbench
    ? flags.title?.trim() || cliConfig.app?.title?.trim() || workbench.name
    : ''

  // A federated app with no entry, view or service would ship a remote with
  // nothing to load — reported first so it fails before any prompt or API call.
  if (workbench) {
    try {
      workbench.assertDeployable()
    } catch (err) {
      reporter.report({
        exitCode: exitCodes.USAGE_ERROR,
        message: getErrorMessage(err),
        solution: 'Declare at least one entry, view, or service in the app',
        status: 'fail',
      })
    }
  }

  const isAutoUpdating = checkAutoUpdates(reporter, {cliConfig, flags})

  // An application ships the SDK runtime; a media-library config stamps its
  // `sanity` version instead.
  let version: string | null = null
  if (deployApplication) {
    version = await checkPackageVersion(reporter, {moduleName: APP_PACKAGE, workDir})
  } else if (deploySingletonConfig) {
    version = await checkPackageVersion(reporter, {moduleName: 'sanity', workDir})
  }

  reporter.report(
    organizationId
      ? {message: `Organization: ${organizationId}`, status: 'pass'}
      : {
          message: NO_ORGANIZATION_ID,
          solution: 'Add `app.organizationId` to sanity.cli.ts',
          status: 'fail',
        },
  )

  checkAppId(reporter, {cliConfig})

  let application: UserApplicationResolved | null = null
  let appCreated = false
  if (flags.external) {
    reporter.report({
      message: EXTERNAL_APP_NOT_SUPPORTED,
      solution: 'Remove the --external flag — apps deploy to Sanity hosting',
      status: 'fail',
    })
  } else if (deployApplication && workbench) {
    // Both modes, so a bad appId fails before the build rather than at the POST.
    await checkAppTarget(reporter, {
      appId,
      isWorkbenchApp: true,
      slug: workbench.slug,
      title: appTitle,
    })
  } else if (deployApplication) {
    ;({application, created: appCreated} = await resolveAppApplication(options, {dryRun, reporter}))
  }

  await checkBuild(reporter, {
    build: () =>
      buildApp({
        autoUpdatesEnabled: isAutoUpdating,
        calledFromDeploy: true,
        cliConfig,
        flags,
        outDir: sourceDir,
        output,
        workDir,
      }),
    skipReason: flags.build
      ? undefined
      : 'Build skipped (--no-build) — validating existing output directory',
    successMessage: 'App built',
  })

  await verifyOutputDir({isWorkbenchApp: workbench !== null, reporter, sourceDir})

  // Manifests aren't strictly essential, so a failure warns and continues
  let manifest: CoreAppManifest | undefined
  try {
    manifest = await extractCoreAppManifest({workDir})
  } catch (err) {
    deployDebug('Error extracting app manifest', err)
    reporter.report({
      message: `Error extracting app manifest: ${getErrorMessage(err)}`,
      status: 'warn',
    })
  }

  // Resolve the installation in both modes so the report — dry-run and real —
  // shows whether the config is deployable; a missing one fails the deploy here.
  let installationId: string | undefined
  let config: string | undefined
  const configAppType = workbench?.config?.appType
  if (deploySingletonConfig && organizationId && workbench?.config && configAppType) {
    installationId = await resolveInstallationId({appType: configAppType, organizationId})
    config = summarizeConfig(workbench.config)
    reporter.report(
      installationId
        ? {config, message: config, status: 'pass'}
        : {
            exitCode: exitCodes.USAGE_ERROR,
            message: `No active "${configAppType}" installation for organization "${organizationId}"`,
            solution: 'Install the Media Library for the organization before deploying its config',
            status: 'fail',
          },
    )
  }

  // Report the exposes deploying with the application, both modes.
  const exposes = deployApplication && workbench ? reportExposes(reporter, workbench) : []

  // Surface the app's explicit singleton flag when set, both modes.
  if (deployApplication && workbench?.isSingleton !== undefined) {
    reporter.report({
      isSingleton: workbench.isSingleton,
      message: `Singleton: ${workbench.isSingleton}`,
      status: 'pass',
    })
  }

  // Dry run stops here — everything below mutates.
  if (dryRun) return

  if (installationId && version && configAppType) {
    await deployConfig({
      appType: configAppType,
      installationId,
      output,
      sourceDir,
      version,
    })
  }

  // A config-only singleton ships no application, only its config.
  if (!deployApplication) {
    if (installationId && version) {
      return {
        applicationType: 'coreApp',
        applicationVersion: version,
        ...(config ? {config} : {}),
        installationId,
        target: null,
      }
    }
    return
  }

  // A real deploy already exited on a version-resolution failure; this narrows the type.
  if (!version) return

  // Workbench apps deploy to Brett; plain coreApps use user-applications.
  if (workbench && organizationId) {
    const appId = getAppId(cliConfig)
    const slug = workbench.slug ?? generateAppSlug()
    const {applicationId} = await deployWorkbenchCoreApp({
      appId,
      interfaces: buildExposes(workbench, {
        appName: workbench.name,
        appTitle,
        exposesAppView: workbench.entry !== undefined,
        version,
      }),
      isAutoUpdating,
      isSingleton: workbench.isSingleton,
      organizationId,
      slug,
      sourceDir,
      title: appTitle,
      version,
    })
    logAppDeployed({
      applicationId,
      cliConfig,
      created: !appId,
      organizationId,
      output,
      title: appTitle,
    })
    return {
      applicationType: 'coreApp',
      applicationVersion: version,
      ...(exposes.length > 0 ? {exposes} : {}),
      ...(workbench.isSingleton === undefined ? {} : {isSingleton: workbench.isSingleton}),
      target: {
        action: appId ? 'update' : 'create',
        applicationId,
        // A redeploy ignores the slug, so only a create reports the one it used.
        ...(appId ? {} : {slug}),
        title: appTitle,
        url: getCoreAppUrl(organizationId, applicationId),
      },
    }
  }

  // A real deploy has already exited if anything failed; landing here without a
  // resolved application means the deploy target was never resolved.
  if (!application) return

  application = await syncApplicationTitle({application, manifest, output})
  await shipAppDeployment({application, isAutoUpdating, manifest, sourceDir, version})
  logAppDeployed({
    applicationId: application.id,
    cliConfig,
    created: appCreated,
    organizationId: application.organizationId,
    output,
    title: application.title,
  })
  return {
    applicationType: 'coreApp',
    applicationVersion: version,
    target: {
      action: appCreated ? 'create' : 'update',
      applicationId: application.id,
      title: application.title ?? null,
      url: getCoreAppUrl(application.organizationId, application.id),
    },
  }
}

/**
 * Finds the application a real deploy targets, creating one when none is
 * configured. A dry run resolves and reports the target read-only instead.
 */
async function resolveAppApplication(
  options: DeployAppOptions,
  {dryRun, reporter}: {dryRun: boolean; reporter: DeployCheckReporter},
): Promise<{application: UserApplicationResolved | null; created: boolean}> {
  const {cliConfig, flags, output} = options
  const organizationId = cliConfig.app?.organizationId ?? ''
  // Create name from --title or `app.title` config; blank falls back to the prompt
  const title = flags.title?.trim() || cliConfig.app?.title?.trim() || undefined

  if (dryRun) {
    await checkAppTarget(reporter, {appId: getAppId(cliConfig), organizationId, title})
    return {application: null, created: false}
  }

  let application = await findUserApplication({
    cliConfig,
    organizationId,
    output,
    title,
    unattended: !!flags.yes,
  })
  deployDebug('User application found', application)

  if (!application) {
    deployDebug('No user application found. Creating a new one')
    application = await createUserApplication(organizationId, title)
    deployDebug('User application created', application)
    return {application, created: true}
  }

  return {application, created: false}
}

/** Syncs the application title from the manifest when it has changed. */
async function syncApplicationTitle({
  application,
  manifest,
  output,
}: {
  application: UserApplicationResolved
  manifest: CoreAppManifest | undefined
  output: DeployAppOptions['output']
}): Promise<UserApplicationResolved> {
  const titleUpdate = resolveTitleUpdate(manifest, application)
  if (!titleUpdate) return application

  deployDebug('Updating application title from manifest', titleUpdate)
  output.log(
    titleUpdate.from
      ? `Updating title from "${titleUpdate.from}" to "${titleUpdate.to}"`
      : `Setting application title to "${titleUpdate.to}"`,
  )
  const spin = spinner('Updating application title').start()
  try {
    const updated = await updateUserApplication({
      applicationId: application.id,
      appType: 'coreApp',
      body: {title: titleUpdate.to},
    })
    spin.succeed()
    return updated
  } catch (err) {
    spin.fail()
    const message = getErrorMessage(err)
    deployDebug('Error updating application title', {message})
    output.warn(`Error updating application title: ${message}`)
    return application
  }
}

async function shipAppDeployment({
  application,
  isAutoUpdating,
  manifest,
  sourceDir,
  version,
}: {
  application: UserApplication
  isAutoUpdating: boolean
  manifest: CoreAppManifest | undefined
  sourceDir: string
  version: string
}): Promise<void> {
  const tarball = pack(dirname(sourceDir), {entries: [basename(sourceDir)]}).pipe(createGzip())

  const spin = spinner('Deploying...').start()
  try {
    await createDeployment({
      applicationId: application.id,
      isApp: true,
      isAutoUpdating,
      manifest,
      tarball,
      version,
    })
  } catch (error) {
    spin.clear()
    throw error
  }
  spin.succeed()
}

export function logAppDeployed({
  applicationId,
  cliConfig,
  created,
  organizationId,
  output,
  title,
}: {
  applicationId: string
  cliConfig: DeployAppOptions['cliConfig']
  created: boolean
  organizationId: string
  output: DeployAppOptions['output']
  title: string | null
}): void {
  const url = getCoreAppUrl(organizationId, applicationId)
  const named = title ? ` — "${title}"` : ''
  output.log(`\nSuccess! Application deployed to ${styleText('cyan', url)}${named}`)
  output.log(created ? 'Created a new application.' : 'Updated the existing application.')

  if (getAppId(cliConfig)) return

  output.log(`\n════ ${styleText('bold', 'Next step:')} ════`)
  if (created) {
    output.log(
      styleText(
        'yellow',
        '\nDeploying again without `deployment.appId` creates another new application.',
      ),
    )
  }
  output.log(
    styleText('bold', '\nAdd the deployment.appId to your sanity.cli.js or sanity.cli.ts file:'),
  )
  output.log(`
${styleText(
  'dim',
  `app: {
  // your application config here…
}`,
)},
${styleText(
  ['bold', 'green'],
  `deployment: {
  appId: '${applicationId}',
}\n`,
)}`)
}
