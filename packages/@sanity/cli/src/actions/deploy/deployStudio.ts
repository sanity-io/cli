import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip, type Gzip} from 'node:zlib'

import {formatSchemaValidation, SchemaExtractionError} from '@sanity/cli-build/_internal/extract'
import {exitCodes} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {getWorkbench} from '@sanity/workbench-cli/deploy'
import {type StudioManifest} from 'sanity'
import {pack} from 'tar-fs'

import {createDeployment, type UserApplication} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'
import {buildStudio} from '../build/buildStudio.js'
import {createStudioUserApplication} from './createUserApplication.js'
import {
  checkAutoUpdates,
  checkBuild,
  checkPackageVersion,
  type CheckReporter,
  checkStudioTarget,
  verifyOutputDir,
} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {listDeploymentFiles} from './deploymentPlan.js'
import {runDeploy} from './deployRunner.js'
import {deployStudioSchemasAndManifests} from './deployStudioSchemasAndManifests.js'
import {findUserApplicationForStudio} from './findUserApplication.js'
import {type DeployAppOptions} from './types.js'

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
): Promise<void> {
  const {cliConfig, flags, output, sourceDir} = options
  const workDir = options.projectRoot.directory
  const isExternal = !!flags.external
  const isWorkbenchApp = getWorkbench(cliConfig) !== null
  const projectId = cliConfig.api?.projectId
  const dryRun = !!flags['dry-run']

  const isAutoUpdating = checkAutoUpdates(reporter, {cliConfig, flags})

  if (isExternal && isWorkbenchApp) {
    // A federated app deploys through Sanity's build/hosting pipeline, which
    // --external skips.
    reporter.report({
      exitCode: exitCodes.USAGE_ERROR,
      message: 'Deploying a federated application to an external host is not yet supported',
      solution: 'Remove the --external flag to deploy to Sanity hosting',
      status: 'fail',
    })
  }

  const version = await checkPackageVersion(reporter, {
    moduleName: 'sanity',
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

  const application = await resolveStudioApplication(options, {dryRun, reporter})

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

  // Dry run stops here — everything below mutates.
  if (dryRun) return

  // A real deploy has already exited if anything failed; landing here without a
  // resolved application or version means the deploy target was never resolved.
  if (!application || !version) return

  const studioManifest = await uploadStudioSchema(options, {isExternal})
  await shipStudioDeployment({
    application,
    isAutoUpdating,
    isExternal,
    options,
    studioManifest,
    version,
  })
}

/**
 * Finds the application a real deploy targets, registering a studio host when
 * none is configured. A dry run resolves and reports the target read-only instead.
 */
async function resolveStudioApplication(
  options: DeployAppOptions,
  {dryRun, reporter}: {dryRun: boolean; reporter: CheckReporter},
): Promise<UserApplication | null> {
  const {cliConfig, flags, output} = options
  const isExternal = !!flags.external
  // Sets the title on a newly registered studio; blank falls back to undefined
  const title = flags.title?.trim() || undefined

  if (dryRun) {
    await checkStudioTarget(reporter, {
      appId: getAppId(cliConfig),
      isExternal,
      projectId: cliConfig.api?.projectId,
      studioHost: cliConfig.studioHost,
      urlFlag: flags.url,
    })
    return null
  }

  const projectId = cliConfig.api?.projectId ?? ''
  let application = await findUserApplicationForStudio({
    appId: getAppId(cliConfig),
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

    application = await createStudioUserApplication({
      projectId,
      title,
      urlType: isExternal ? 'external' : 'internal',
    })
    deployDebug('Created user application', application)
  }

  deployDebug('Found user application', application)
  return application
}

/** Extracts the studio schema and manifest and uploads them to the schema store. */
async function uploadStudioSchema(
  options: DeployAppOptions,
  {isExternal}: {isExternal: boolean},
): Promise<StudioManifest | null> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options

  let studioManifest: StudioManifest | null = null
  try {
    studioManifest = await deployStudioSchemasAndManifests({
      configPath: projectRoot.path,
      isExternal,
      outPath: `${sourceDir}/static`,
      projectId: cliConfig.api?.projectId ?? '',
      schemaRequired: flags['schema-required'],
      verbose: flags.verbose,
      workDir: projectRoot.directory,
    })
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
}): Promise<void> {
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

  output.log(
    isExternal
      ? `\nSuccess! Studio registered`
      : `\nSuccess! Studio deployed to ${styleText('cyan', location)}`,
  )

  if (getAppId(cliConfig)) return

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
}

function studioBuildSkipReason({build, isExternal}: {build: boolean; isExternal: boolean}) {
  if (isExternal) return 'Build skipped for externally hosted studios'
  if (!build) return 'Build skipped (--no-build) — validating existing output directory'
  return
}
