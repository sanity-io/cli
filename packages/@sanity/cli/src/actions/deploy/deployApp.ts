import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip} from 'node:zlib'

import {type AppVisibility, exitCodes} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {getCoreAppUrl} from '@sanity/cli-core/util'
import {spinner} from '@sanity/cli-core/ux'
import {
  buildExposes,
  createCoreApp,
  deployConfig,
  deployWorkbenchApp,
  getApplicationUrl,
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
import {
  extractCoreAppManifest,
  readIconFromPath,
  resolveTitleUpdate,
} from '../manifest/extractCoreAppManifest.js'
import {type CoreAppManifest} from '../manifest/types.js'
import {createUserApplication} from './createUserApplication.js'
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
    await checkAppTarget(reporter, {
      appId,
      isWorkbenchApp: true,
      slug: workbench.slug,
      title: appTitle,
    })
  } else if (deployApplication) {
    ;({application, created: appCreated} = await resolveAppApplication(options, {dryRun, reporter}))
  }

  // Read up front so a bad icon path fails before we create or build.
  const appIcon =
    !dryRun && workbench?.icon ? await readIconFromPath(workDir, workbench.icon) : undefined

  // Create the app before the build so the bundle carries its real id. A
  // redeploy already has it from `deployment.appId`; a dry run skips creation.
  let applicationId = appId
  let applicationCreated = false
  let rollbackApp: (() => Promise<void>) | undefined
  if (!dryRun && deployApplication && workbench && organizationId && !applicationId) {
    ;({applicationId, rollback: rollbackApp} = await createCoreApp({
      isSingleton: workbench.isSingleton,
      organizationId,
      slug: workbench.slug,
      title: appTitle,
      visibility: workbench.visibility,
    }))
    applicationCreated = true
  }

  // A record created above is stranded at its slug (and blocks retries) if any
  // step before it fully deploys fails, so undo the creation on failure.
  try {
    await checkBuild(reporter, {
      build: () =>
        buildApp({
          applicationId: workbench ? applicationId : undefined,
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

    // Workbench apps ship their icon straight to Brett (below) and don't read the
    // core-app manifest; only plain core-apps do. Manifests aren't strictly
    // essential, so a failure warns and continues.
    let manifest: CoreAppManifest | undefined
    if (!workbench) {
      try {
        manifest = await extractCoreAppManifest({workDir})
      } catch (err) {
        deployDebug('Error extracting app manifest', err)
        reporter.report({
          message: `Error extracting app manifest: ${getErrorMessage(err)}`,
          status: 'warn',
        })
      }
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
              solution:
                'Install the Media Library for the organization before deploying its config',
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

    if (installationId && version && configAppType && organizationId) {
      await deployConfig({
        appType: configAppType,
        installationId,
        organizationId,
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

    // The app was created (or resolved from `deployment.appId`) before the build,
    // so this only ships the deployment; plain coreApps use user-applications below.
    if (workbench && organizationId && applicationId) {
      await deployWorkbenchApp({
        applicationId,
        icon: appIcon,
        interfaces: buildExposes(workbench, {
          appName: workbench.name,
          appTitle,
          exposesAppView: workbench.entry !== undefined,
          version,
        }),
        isAutoUpdating,
        sourceDir,
        title: appTitle,
        version,
      })
      const url = getApplicationUrl({id: applicationId, organizationId, type: 'coreApp'})
      logAppDeployed({
        applicationId,
        cliConfig,
        created: applicationCreated,
        organizationId,
        output,
        title: appTitle,
        url,
      })
      return {
        applicationType: 'coreApp',
        applicationVersion: version,
        ...(exposes.length > 0 ? {exposes} : {}),
        ...(workbench.isSingleton === undefined ? {} : {isSingleton: workbench.isSingleton}),
        target: {
          action: applicationCreated ? 'create' : 'update',
          applicationId,
          // A redeploy targets an existing app; only a create reports the slug.
          ...(applicationCreated ? {slug: workbench.slug} : {}),
          title: appTitle,
          url,
        },
      }
    }

    // A real deploy has already exited if anything failed; landing here without a
    // resolved application means the deploy target was never resolved.
    if (!application) return

    application = await syncApplicationMetadata({
      application,
      manifest,
      output,
      visibility: cliConfig.app?.visibility,
    })
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
  } catch (err) {
    await rollbackApp?.()
    throw err
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
    application = await createUserApplication(organizationId, title, cliConfig.app?.visibility)
    deployDebug('User application created', application)
    return {application, created: true}
  }

  return {application, created: false}
}

/**
 * Syncs application metadata on redeploy when it has changed: the title from the
 * manifest and the dashboard visibility from config. Sends a single PATCH with
 * only the changed fields, and skips the request entirely when nothing changed.
 */
export async function syncApplicationMetadata({
  application,
  manifest,
  output,
  visibility,
}: {
  application: UserApplicationResolved
  manifest: CoreAppManifest | undefined
  output: DeployAppOptions['output']
  visibility: AppVisibility | undefined
}): Promise<UserApplicationResolved> {
  const titleUpdate = resolveTitleUpdate(manifest, application)
  // Treat an unset server value as `default` so a config of `default` is a no-op.
  const visibilityChanged =
    visibility !== undefined && visibility !== (application.dashboardStatus ?? 'default')

  if (!titleUpdate && !visibilityChanged) return application

  if (titleUpdate) {
    deployDebug('Updating application title from manifest', titleUpdate)
    output.log(
      titleUpdate.from
        ? `Updating title from "${titleUpdate.from}" to "${titleUpdate.to}"`
        : `Setting application title to "${titleUpdate.to}"`,
    )
  }
  if (visibilityChanged) {
    output.log(`Setting dashboard visibility to "${visibility}"`)
  }

  const spin = spinner('Updating application').start()
  try {
    const updated = await updateUserApplication({
      applicationId: application.id,
      appType: 'coreApp',
      body: {
        ...(titleUpdate ? {title: titleUpdate.to} : {}),
        ...(visibilityChanged ? {dashboardStatus: visibility} : {}),
      },
    })
    spin.succeed()
    return updated
  } catch (err) {
    spin.fail()
    const message = getErrorMessage(err)
    deployDebug('Error updating application metadata', {message})
    output.warn(`Error updating application metadata: ${message}`)
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
  url = getCoreAppUrl(organizationId, applicationId),
}: {
  applicationId: string
  cliConfig: DeployAppOptions['cliConfig']
  created: boolean
  organizationId: string
  output: DeployAppOptions['output']
  title: string | null
  url?: string
}): void {
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
