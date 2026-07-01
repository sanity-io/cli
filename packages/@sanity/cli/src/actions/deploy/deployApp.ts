import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip} from 'node:zlib'

import {exitCodes} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {getWorkbench} from '@sanity/workbench-cli/deploy'
import {pack} from 'tar-fs'

import {
  createDeployment,
  updateUserApplication,
  type UserApplication,
} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {EXTERNAL_APP_NOT_SUPPORTED, NO_ORGANIZATION_ID} from '../../util/errorMessages.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {buildApp} from '../build/buildApp.js'
import {extractCoreAppManifest, resolveTitleUpdate} from '../manifest/extractCoreAppManifest.js'
import {type CoreAppManifest} from '../manifest/types.js'
import {createUserApplication} from './createUserApplication.js'
import {
  checkAppId,
  checkAppTarget,
  checkAutoUpdates,
  checkBuild,
  checkPackageVersion,
  type CheckReporter,
  verifyOutputDir,
} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {listDeploymentFiles} from './deploymentPlan.js'
import {type DeployResult, runDeploy} from './deployRunner.js'
import {findUserApplication} from './findUserApplication.js'
import {type DeployAppOptions} from './types.js'

const APP_PACKAGE = '@sanity/sdk-react'

export function deployApp(options: DeployAppOptions): Promise<void> {
  return runDeploy(options, {
    listFiles: ({projectRoot, sourceDir}) => listDeploymentFiles(sourceDir, projectRoot.directory),
    packageName: APP_PACKAGE,
    run: runAppDeployment,
    type: 'coreApp',
  })
}

/** Validates the deploy, syncs the title from the manifest, and ships the build. */
async function runAppDeployment(
  options: DeployAppOptions,
  reporter: CheckReporter,
): Promise<DeployResult | void> {
  const {cliConfig, flags, output, sourceDir} = options
  const workDir = options.projectRoot.directory
  const organizationId = cliConfig.app?.organizationId
  const workbench = getWorkbench(cliConfig)
  const dryRun = !!flags['dry-run']

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

  const version = await checkPackageVersion(reporter, {
    moduleName: APP_PACKAGE,
    workDir,
  })

  reporter.report(
    organizationId
      ? {message: `Organization: ${organizationId}`, status: 'pass'}
      : {
          message: NO_ORGANIZATION_ID,
          solution: 'Add `app.organizationId` to sanity.cli.ts',
          status: 'fail',
        },
  )

  let application: UserApplication | null = null
  if (flags.external) {
    reporter.report({
      message: EXTERNAL_APP_NOT_SUPPORTED,
      solution: 'Remove the --external flag — apps deploy to Sanity hosting',
      status: 'fail',
    })
  } else {
    application = await resolveAppApplication(options, {dryRun, reporter})
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

  // Dry run stops here — everything below mutates.
  if (dryRun) return

  // A real deploy has already exited if anything failed; landing here without a
  // resolved application or version means the deploy target was never resolved.
  if (!application || !version) return

  application = await syncApplicationTitle({application, manifest, output})
  await shipAppDeployment({application, isAutoUpdating, manifest, sourceDir, version})

  logAppDeployed({application, cliConfig, output})

  return {
    applicationId: application.id,
    applicationType: 'coreApp',
    applicationVersion: version,
    location: null,
  }
}

/**
 * Finds the application a real deploy targets, creating one when none is
 * configured. A dry run resolves and reports the target read-only instead.
 */
async function resolveAppApplication(
  options: DeployAppOptions,
  {dryRun, reporter}: {dryRun: boolean; reporter: CheckReporter},
): Promise<UserApplication | null> {
  const {cliConfig, output} = options
  const organizationId = cliConfig.app?.organizationId ?? ''

  if (dryRun) {
    checkAppId(reporter, {cliConfig})
    await checkAppTarget(reporter, {appId: getAppId(cliConfig), organizationId})
    return null
  }

  let application = await findUserApplication({cliConfig, organizationId, output})
  deployDebug('User application found', application)

  if (!application) {
    deployDebug('No user application found. Creating a new one')
    application = await createUserApplication(organizationId)
    deployDebug('User application created', application)
  }

  return application
}

/** Syncs the application title from the manifest when it has changed. */
async function syncApplicationTitle({
  application,
  manifest,
  output,
}: {
  application: UserApplication
  manifest: CoreAppManifest | undefined
  output: DeployAppOptions['output']
}): Promise<UserApplication> {
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

function logAppDeployed({
  application,
  cliConfig,
  output,
}: {
  application: UserApplication
  cliConfig: DeployAppOptions['cliConfig']
  output: DeployAppOptions['output']
}): void {
  output.log(`\n🚀 ${styleText('bold', 'Success!')} Application deployed`)

  if (getAppId(cliConfig)) return

  output.log(`\n════ ${styleText('bold', 'Next step:')} ════`)
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
  appId: '${application.id}',
}\n`,
)}`)
}
