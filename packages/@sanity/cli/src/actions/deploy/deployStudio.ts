import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip, type Gzip} from 'node:zlib'

import {CLIError} from '@oclif/core/errors'
import {formatSchemaValidation, SchemaExtractionError} from '@sanity/cli-build/_internal/extract'
import {exitCodes} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {getWorkbench} from '@sanity/workbench-cli/deploy'
import {type StudioManifest} from 'sanity'
import {pack} from 'tar-fs'

import {createDeployment, type UserApplication} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {buildStudio} from '../build/buildStudio.js'
import {createStudioUserApplication} from './createUserApplication.js'
import {
  checkAutoUpdates,
  checkBuild,
  checkOutputDir,
  checkPackageVersion,
  checkStudioTarget,
  createAggregatingChecks,
  createFailFastChecks,
  type DeployChecks,
  type DeployTarget,
  verifyOutputDir,
} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {deployStudioSchemasAndManifests} from './deployStudioSchemasAndManifests.js'
import {type DryRunReport, isDeployable} from './dryRunReport.js'
import {findUserApplicationForStudio} from './findUserApplication.js'
import {type DeployFileSummary} from './listDeploymentFiles.js'
import {type DeployAppOptions, type DeployFlags} from './types.js'

/**
 * Builds and deploys the studio. With --dry-run, runs the same sequence
 * read-only and returns a report instead of shipping.
 */
export async function deployStudio(options: DeployAppOptions): Promise<DryRunReport | undefined> {
  const {cliConfig, flags, output} = options

  if (flags['dry-run']) {
    const checks = createAggregatingChecks()
    const {files, target} = await createStudioDeployment(options, checks)

    if (!getAppId(cliConfig) && target?.appId) {
      checks.add({
        message: `Add deployment.appId: '${target.appId}' to sanity.cli.ts to skip hostname lookups and prompts on deploy.`,
        name: 'app-id-config',
        status: 'warn',
      })
    }

    return {
      checks: checks.all(),
      deployable: isDeployable(checks.all()),
      dryRun: true,
      files,
      target,
    }
  }

  try {
    const checks = createFailFastChecks(output)
    await createStudioDeployment(options, checks)
  } catch (error) {
    if (error instanceof CLIError) {
      output.error(error.message, {exit: error.oclif?.exit ?? exitCodes.RUNTIME_ERROR})
      return undefined
    }
    deployDebug('Error deploying studio', error)
    output.error(`Error deploying studio: ${error}`, {exit: 1})
  }
  return undefined
}

interface StudioDeployment {
  application: UserApplication | null
  files: DeployFileSummary | null
  isAutoUpdating: boolean
  studioManifest: StudioManifest | null
  target: DeployTarget | null
  version: string | null
}

/**
 * Validates the deploy, extracts and uploads the schema, and ships the build.
 * Steps report through `checks` (fail fast for real deploys, aggregated for dry
 * runs); side-effecting steps and the upload branch on `--dry-run`.
 */
async function createStudioDeployment(
  options: DeployAppOptions,
  checks: DeployChecks,
): Promise<StudioDeployment> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options
  const workDir = projectRoot.directory
  const isExternal = !!flags.external
  const workbench = getWorkbench(cliConfig)
  const projectId = cliConfig.api?.projectId
  const dryRun = !!flags['dry-run']

  const isAutoUpdating = checkAutoUpdates(checks, {cliConfig, flags})

  if (isExternal && workbench) {
    // A federated app deploys through Sanity's build/hosting pipeline, which
    // --external skips.
    checks.add({
      exitCode: exitCodes.USAGE_ERROR,
      message:
        'Deploying a federated application to an external host is not yet supported. ' +
        'Remove the `--external` flag to deploy to Sanity hosting.',
      name: 'target',
      status: 'fail',
    })
  }

  const version = await checkPackageVersion(checks, {
    moduleName: 'sanity',
    name: 'sanity-version',
    workDir,
  })

  checks.add(
    projectId
      ? {message: `Project: ${projectId}`, name: 'project-id', status: 'pass'}
      : {message: NO_PROJECT_ID, name: 'project-id', status: 'fail'},
  )

  let application: UserApplication | null = null
  let target: DeployTarget | null = null
  if (dryRun) {
    target = await checkStudioTarget(checks, {
      appId: getAppId(cliConfig),
      isExternal,
      projectId,
      studioHost: cliConfig.studioHost,
      urlFlag: flags.url,
    })
  } else {
    application = await resolveStudioApplication(options)
  }

  await checkBuild(checks, {
    build: () =>
      buildStudio({
        autoUpdatesEnabled: isAutoUpdating,
        calledFromDeploy: true,
        cliConfig,
        // Dry runs never prompt
        flags: dryRun ? ({...flags, yes: true} as DeployFlags) : flags,
        outDir: sourceDir,
        output,
        workDir,
      }),
    skipReason: studioBuildSkipReason({build: flags.build, isExternal}),
    successMessage: 'Studio built',
  })

  const studioManifest = await deployStudioSchema(options, checks)

  let files: DeployFileSummary | null = null
  if (dryRun) {
    files = await checkOutputDir(checks, {
      skipReason: isExternal
        ? 'Output directory check skipped for externally hosted studios'
        : undefined,
      sourceDir,
      workbench,
    })
  } else if (!isExternal) {
    await verifyOutputDir({output, sourceDir, workbench})
  }

  if (dryRun || !application || !version) {
    return {application, files, isAutoUpdating, studioManifest, target, version}
  }

  let tarball: Gzip | undefined
  if (!isExternal) {
    const parentDir = dirname(sourceDir)
    const base = basename(sourceDir)
    tarball = pack(parentDir, {entries: [base]}).pipe(createGzip())
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

  if (!getAppId(cliConfig)) {
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

  return {application, files, isAutoUpdating, studioManifest, target, version}
}

/** Resolves the studio's target application, registering a new host if none exists. */
async function resolveStudioApplication(
  options: DeployAppOptions,
): Promise<UserApplication | null> {
  const {cliConfig, flags, output} = options
  const isExternal = !!flags.external
  const projectId = cliConfig.api?.projectId ?? ''

  let application = await findUserApplicationForStudio({
    appId: getAppId(cliConfig),
    isExternal,
    output,
    projectId,
    studioHost: cliConfig.studioHost,
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
      urlType: isExternal ? 'external' : 'internal',
    })
    deployDebug('Created user application', application)
  }

  deployDebug('Found user application', application)
  return application
}

/**
 * Extracts and validates the schema. A real deploy uploads it and returns the
 * studio manifest; a dry run validates only and reports a workspace summary.
 */
async function deployStudioSchema(
  options: DeployAppOptions,
  checks: DeployChecks,
): Promise<StudioManifest | null> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options
  const dryRun = !!flags['dry-run']
  const schemaOptions = {
    configPath: projectRoot.path,
    isExternal: !!flags.external,
    outPath: `${sourceDir}/static`,
    projectId: cliConfig.api?.projectId ?? '',
    schemaRequired: flags['schema-required'],
    verbose: flags.verbose,
    workDir: projectRoot.directory,
  }

  if (dryRun) {
    await checks.run(
      'schema',
      async () => {
        const {workspaces} = await deployStudioSchemasAndManifests({...schemaOptions, dryRun})
        const typeCount = workspaces.reduce((count, workspace) => count + workspace.schemaTypes, 0)
        checks.add({
          message: `Schema valid (${workspaces.length} ${workspaces.length === 1 ? 'workspace' : 'workspaces'}, ${typeCount} ${typeCount === 1 ? 'type' : 'types'})`,
          name: 'schema',
          status: 'pass',
        })
      },
      (err) =>
        err instanceof SchemaExtractionError && err.validation
          ? `Schema validation failed:\n${formatSchemaValidation(err.validation)}`
          : `Schema validation failed: ${getErrorMessage(err)}`,
    )
    return null
  }

  let studioManifest: StudioManifest | null = null
  try {
    const result = await deployStudioSchemasAndManifests(schemaOptions)
    studioManifest = result.studioManifest
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

function studioBuildSkipReason({build, isExternal}: {build: boolean; isExternal: boolean}) {
  if (isExternal) return 'Build skipped for externally hosted studios'
  if (!build) return 'Build skipped (--no-build) — validating existing output directory'
  return
}
