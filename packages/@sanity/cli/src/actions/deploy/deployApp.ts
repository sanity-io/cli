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
import {createUserApplicationForApp} from './createUserApplicationForApp.js'
import {
  checkAutoUpdates,
  checkBuild,
  checkPackageVersion,
  createFailFastChecks,
  type DeployChecks,
  verifyOutputDir,
} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {findUserApplicationForApp} from './findUserApplicationForApp.js'
import {type DeployAppOptions} from './types.js'

type Workbench = ReturnType<typeof getWorkbench>

/**
 * Builds and deploys a Sanity application.
 *
 * @internal
 */
export async function deployApp(options: DeployAppOptions): Promise<void> {
  const {cliConfig, output} = options
  const workbench = getWorkbench(cliConfig)

  // A federated app with no entry, view or service would ship a remote with
  // nothing to load — fail before any prompts or API calls.
  if (workbench) {
    try {
      workbench.assertDeployable()
    } catch (err) {
      output.error(getErrorMessage(err), {exit: exitCodes.USAGE_ERROR})
      return
    }
  }

  try {
    const checks = createFailFastChecks(output)
    await createAppDeployment(options, checks, workbench)
  } catch (error) {
    // Don't throw a generic error when the user cancels a prompt
    if (error.name === 'ExitPromptError') {
      output.error('Deployment cancelled by user', {exit: 1})
      return
    }
    if (error instanceof CLIError) {
      const {message, ...errorOptions} = error
      output.error(message, {...errorOptions, exit: 1})
      return
    }
    deployDebug('Error deploying application', error)
    output.error(`Error deploying application: ${error}`, {exit: 1})
  }
}

interface AppDeployment {
  application: UserApplication | null
  isAutoUpdating: boolean
  manifest: CoreAppManifest | undefined
  version: string | null
}

/**
 * Validates the deploy, syncs the title from the manifest, and ships the build.
 * Steps report through `checks`; a real deploy fails fast on the first problem.
 */
async function createAppDeployment(
  options: DeployAppOptions,
  checks: DeployChecks,
  workbench: Workbench,
): Promise<AppDeployment> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options
  const workDir = projectRoot.directory
  const organizationId = cliConfig.app?.organizationId

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
  if (flags.external) {
    checks.add({message: EXTERNAL_APP_NOT_SUPPORTED, name: 'target', status: 'fail'})
  } else {
    application = await resolveAppApplication(options)
  }

  await checkBuild(checks, {
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

  await verifyOutputDir({isWorkbenchApp: workbench !== null, output, sourceDir})

  // Manifests aren't strictly essential, so a failure warns and continues
  let manifest: CoreAppManifest | undefined
  try {
    manifest = await extractCoreAppManifest({workDir})
  } catch (err) {
    deployDebug('Error extracting app manifest', err)
    checks.add({
      message: `Error extracting app manifest: ${getErrorMessage(err)}`,
      name: 'app-manifest',
      status: 'warn',
    })
  }

  // Sync the application title from the manifest when it has changed
  const titleUpdate = application ? resolveTitleUpdate(manifest, application) : null
  if (application && titleUpdate) {
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

  if (!application || !version) return {application, isAutoUpdating, manifest, version}

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
      return {application, isAutoUpdating, manifest, version}
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

  return {application, isAutoUpdating, manifest, version}
}

/** Resolves the app's target application, creating one when none exists. */
async function resolveAppApplication(options: DeployAppOptions): Promise<UserApplication | null> {
  const {cliConfig, output} = options
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
