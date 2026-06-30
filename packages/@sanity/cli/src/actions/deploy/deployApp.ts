import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip} from 'node:zlib'

import {CLIError} from '@oclif/core/errors'
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
import {createUserApplicationForApp} from './createUserApplication.js'
import {
  checkAppTarget,
  checkAutoUpdates,
  checkBuild,
  checkOutputDir,
  checkPackageVersion,
  createAggregatingChecks,
  createFailFastChecks,
  type DeployChecks,
  type DeployTarget,
  verifyOutputDir,
} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {type DryRunReport, isDeployable} from './dryRunReport.js'
import {findUserApplicationForApp} from './findUserApplication.js'
import {type DeployFileSummary} from './listDeploymentFiles.js'
import {type DeployAppOptions, type DeployFlags} from './types.js'

type Workbench = ReturnType<typeof getWorkbench>

/**
 * Builds and deploys a Sanity application. With --dry-run, runs the same
 * sequence read-only and returns a report instead of shipping.
 *
 * @internal
 */
export async function deployApp(options: DeployAppOptions): Promise<DryRunReport | undefined> {
  const {cliConfig, flags, output} = options
  const workbench = getWorkbench(cliConfig)

  if (flags['dry-run']) {
    const checks = createAggregatingChecks()
    if (workbench) {
      try {
        workbench.assertDeployable()
      } catch (err) {
        checks.add({message: getErrorMessage(err), name: 'app-deployable', status: 'fail'})
      }
    }
    const {files, target} = await createAppDeployment(options, checks, workbench)
    return {
      checks: checks.all(),
      deployable: isDeployable(checks.all()),
      dryRun: true,
      files,
      target,
    }
  }

  // A federated app with no entry, view or service would ship a remote with
  // nothing to load — fail before any prompts or API calls.
  if (workbench) {
    try {
      workbench.assertDeployable()
    } catch (err) {
      output.error(getErrorMessage(err), {exit: exitCodes.USAGE_ERROR})
      return undefined
    }
  }

  try {
    const checks = createFailFastChecks(output)
    await createAppDeployment(options, checks, workbench)
  } catch (error) {
    // Don't throw a generic error when the user cancels a prompt
    if (error.name === 'ExitPromptError') {
      output.error('Deployment cancelled by user', {exit: 1})
      return undefined
    }
    if (error instanceof CLIError) {
      const {message, ...errorOptions} = error
      output.error(message, {...errorOptions, exit: 1})
      return undefined
    }
    deployDebug('Error deploying application', error)
    output.error(`Error deploying application: ${error}`, {exit: 1})
  }
  return undefined
}

interface AppDeployment {
  application: UserApplication | null
  files: DeployFileSummary | null
  isAutoUpdating: boolean
  manifest: CoreAppManifest | undefined
  target: DeployTarget | null
  version: string | null
}

/**
 * Validates the deploy, syncs the title from the manifest, and ships the build.
 * Steps report through `checks` (fail fast for real deploys, aggregated for dry
 * runs); side-effecting steps and the upload branch on `--dry-run`.
 */
async function createAppDeployment(
  options: DeployAppOptions,
  checks: DeployChecks,
  workbench: Workbench,
): Promise<AppDeployment> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options
  const workDir = projectRoot.directory
  const organizationId = cliConfig.app?.organizationId
  const dryRun = !!flags['dry-run']

  const isAutoUpdating = checkAutoUpdates(checks, {cliConfig, flags})

  const version = await checkPackageVersion(checks, {
    moduleName: '@sanity/sdk-react',
    name: 'sdk-version',
    workDir,
  })

  checks.add(
    organizationId
      ? {message: `Organization: ${organizationId}`, name: 'organization-id', status: 'pass'}
      : {message: NO_ORGANIZATION_ID, name: 'organization-id', status: 'fail'},
  )

  let application: UserApplication | null = null
  let target: DeployTarget | null = null
  if (flags.external) {
    checks.add({message: EXTERNAL_APP_NOT_SUPPORTED, name: 'target', status: 'fail'})
  } else if (dryRun) {
    ;({existingApp: application, target} = await checkAppTarget(checks, {
      appId: getAppId(cliConfig),
      organizationId,
    }))
  } else {
    application = await resolveAppApplication(options)
  }

  await checkBuild(checks, {
    build: () =>
      buildApp({
        autoUpdatesEnabled: isAutoUpdating,
        calledFromDeploy: true,
        cliConfig,
        // Dry runs never prompt
        flags: dryRun ? ({...flags, yes: true} as DeployFlags) : flags,
        outDir: sourceDir,
        output,
        workDir,
      }),
    skipReason: flags.build
      ? undefined
      : 'Build skipped (--no-build) — validating existing output directory',
    successMessage: 'App built',
  })

  let files: DeployFileSummary | null = null
  if (dryRun) {
    files = await checkOutputDir(checks, {sourceDir, workbench})
  } else {
    await verifyOutputDir({output, sourceDir, workbench})
  }

  // Manifests aren't strictly essential, so a failure warns and continues
  let manifest: CoreAppManifest | undefined
  let manifestFailed = false
  try {
    manifest = await extractCoreAppManifest({workDir})
  } catch (err) {
    deployDebug('Error extracting app manifest', err)
    checks.add({
      message: `Error extracting app manifest: ${getErrorMessage(err)}`,
      name: 'app-manifest',
      status: 'warn',
    })
    manifestFailed = true
  }

  // Sync the application title from the manifest when it has changed
  const titleUpdate = application ? resolveTitleUpdate(manifest, application) : null
  if (dryRun) {
    if (!manifestFailed) {
      checks.add({
        message: titleUpdate
          ? titleUpdate.from
            ? `Would update application title from "${titleUpdate.from}" to "${titleUpdate.to}"`
            : `Would set application title to "${titleUpdate.to}"`
          : manifest
            ? 'App manifest extracted'
            : 'No app manifest (no icon or title in app configuration)',
        name: 'app-manifest',
        status: 'pass',
      })
    }
  } else if (application && titleUpdate) {
    deployDebug('Updating application title from manifest', titleUpdate)
    output.log(
      titleUpdate.from
        ? `Updating title from "${titleUpdate.from}" to "${titleUpdate.to}"`
        : `Setting application title to "${titleUpdate.to}"`,
    )
    const spin = spinner('Updating application title').start()
    try {
      application = await updateUserApplication({
        applicationId: application.id,
        appType: 'coreApp',
        body: {title: titleUpdate.to},
      })
      spin.succeed()
    } catch (err) {
      spin.fail()
      const message = getErrorMessage(err)
      deployDebug('Error updating application title', {message})
      output.warn(`Error updating application title: ${message}`)
    }
  }

  if (dryRun || !application || !version) {
    return {application, files, isAutoUpdating, manifest, target, version}
  }

  const parentDir = dirname(sourceDir)
  const base = basename(sourceDir)
  const tarball = pack(parentDir, {entries: [base]}).pipe(createGzip())

  // Register the app's declared views with the application service. The payload
  // is validated and logged (the storing service doesn't exist yet); a malformed
  // view declaration fails the deploy before we ship the bundle.
  if (workbench) {
    try {
      const payload = workbench.buildViewDeploymentPayload(application.id)
      if (payload.views.length > 0) {
        output.log(
          `Validated ${payload.views.length} view(s) for the application service (not yet persisted):`,
        )
        output.log(JSON.stringify(payload, null, 2))
        deployDebug('View deployment payload', payload)
      }
    } catch (err) {
      output.error(`Invalid view declaration: ${getErrorMessage(err)}`, {exit: 1})
      return {application, files, isAutoUpdating, manifest, target, version}
    }
  }

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

  output.log(`\n🚀 ${styleText('bold', 'Success!')} Application deployed`)

  if (!getAppId(cliConfig)) {
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

  return {application, files, isAutoUpdating, manifest, target, version}
}

/** Resolves the app's target application, creating one when none exists. */
async function resolveAppApplication(options: DeployAppOptions): Promise<UserApplication | null> {
  const {cliConfig, flags, output} = options
  if (flags.external) return null

  const organizationId = cliConfig.app?.organizationId ?? ''
  let application = await findUserApplicationForApp({cliConfig, organizationId, output})
  deployDebug('User application found', application)

  if (!application) {
    deployDebug('No user application found. Creating a new one')
    application = await createUserApplicationForApp(organizationId)
    deployDebug('User application created', application)
  }

  return application
}
