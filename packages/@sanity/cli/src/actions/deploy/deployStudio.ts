import {basename, dirname, join, relative} from 'node:path'
import {styleText} from 'node:util'
import {createGzip, type Gzip} from 'node:zlib'

import {findBlueprintFile, readBlueprint} from '@sanity/blueprints/resolve'
import {formatSchemaValidation, SchemaExtractionError} from '@sanity/cli-build/_internal/extract'
import {readIconFromPath} from '@sanity/cli-build/_internal/manifest'
import {exitCodes} from '@sanity/cli-core'
import {prettyPrintError} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {
  type BrettAccess,
  type BrettWorkspace,
  createStudio,
  deployWorkbenchApp,
  getApplicationUrl,
  getWorkbench,
  getWorkbenchUrl,
  toWorkbenchPayload,
} from '@sanity/workbench-cli/deploy'
import {type StudioManifest} from 'sanity'
import {c as createTar} from 'tar'

import {createDeployment, type UserApplication} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {NO_ORGANIZATION_ID, NO_PROJECT_ID} from '../../util/errorMessages.js'
import {buildStudio} from '../build/buildStudio.js'
import {createStudioUserApplication} from './createUserApplication.js'
import {
  checkAutoUpdates,
  checkBuild,
  checkExternalUrl,
  checkPackageVersion,
  checkStudioTarget,
  type DeployCheckReporter,
  verifyOutputDir,
} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {listDeploymentFiles, reportInterfaces} from './deploymentPlan.js'
import {type DeployPayload, type DeployResult, runDeploy} from './deployRunner.js'
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
  reporter: DeployCheckReporter,
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
  // A legacy external studio only registers its URL; a federated one is built
  // and deployed like a hosted one, minus the upload.
  const isLegacyExternal = isExternal && !isWorkbenchApp

  const appTitle = workbench
    ? flags.title?.trim() || cliConfig.app?.title?.trim() || workbench.slug
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

  if (await isBlueprintStudio(options.projectRoot.directory)) {
    reporter.report({
      message:
        'Using the `deploy` command for a studio that is referenced by a blueprint is not allowed',
      solution: 'Deploy the studio using the `blueprints deploy` command',
      status: 'fail',
    })
  }

  // Workbench studios deploy to Brett (which needs the org); plain studios
  // resolve/create on user-applications, unchanged.
  let application: UserApplication | null = null
  let studioCreated = false
  let workbenchApp: {externalUrl?: string} | undefined
  let externalUrl: string | undefined
  if (workbench) {
    reporter.report(
      organizationId
        ? {message: `Organization: ${organizationId}`, status: 'pass'}
        : {
            message: NO_ORGANIZATION_ID,
            solution: 'Add `app.organizationId` to sanity.cli.ts',
            status: 'fail',
          },
    )
    workbenchApp = (
      await checkStudioTarget(reporter, {
        appId,
        isWorkbenchApp: true,
        organizationId,
        slug: workbench.slug,
        title: appTitle,
      })
    )?.application
    if (isExternal) externalUrl = checkExternalUrl(reporter, {appId, url: flags.url})
  } else {
    ;({application, created: studioCreated} = await resolveStudioApplication(options, {
      dryRun,
      reporter,
    }))
  }
  // A redeploy follows how the application was registered, so --external is only needed once.
  const isExternallyHosted = isExternal || !!workbenchApp?.externalUrl

  // A first deploy mints the app id and the build inlines it; --no-build would
  // ship an existing bundle carrying a different id, so it can't be a first deploy.
  if (workbench && !appId && !flags.build) {
    reporter.report({
      exitCode: exitCodes.USAGE_ERROR,
      message: 'A first deploy cannot skip the build (--no-build)',
      solution: 'Drop --no-build so the new application id is inlined into the build',
      status: 'fail',
    })
  }

  // Read up front so a bad icon path fails before we create or build.
  const appIcon =
    !dryRun && workbench?.icon ? await readIconFromPath(workDir, workbench.icon) : undefined

  // Create the studio before the build so the bundle carries its real id. A
  // redeploy already has it from `deployment.appId`; a dry run skips creation.
  let applicationId = appId
  let applicationCreated = false
  let rollbackApp: (() => Promise<void>) | undefined
  if (!dryRun && workbench && organizationId && !applicationId) {
    const created = await createStudio({
      externalUrl,
      name: workbench.name,
      organizationId,
      projectId,
      slug: workbench.slug,
      title: appTitle,
      visibility: workbench.visibility,
    })
    workbenchApp = created.application
    applicationId = created.application.id
    rollbackApp = created.rollback
    applicationCreated = true
  }

  // A record created above is stranded at its slug (and blocks retries) if any
  // step before it fully deploys fails, so undo the creation on failure.
  try {
    const built = await checkBuild(reporter, {
      build: () =>
        buildStudio({
          applicationId: workbench ? applicationId : undefined,
          autoUpdatesEnabled: isAutoUpdating,
          calledFromDeploy: true,
          cliConfig,
          flags,
          outDir: sourceDir,
          output,
          workDir,
        }),
      skipReason: studioBuildSkipReason({build: flags.build, isLegacyExternal}),
      successMessage: 'Studio built',
    })

    let mfManifest = built?.mfManifest
    // A federated build has already read its manifest; anything else verifies the directory.
    if (mfManifest === undefined && !isLegacyExternal) {
      mfManifest = await verifyOutputDir({isWorkbenchApp, reporter, sourceDir})
    }

    const interfaces = workbench ? reportInterfaces(reporter, workbench) : null

    const payload: DeployPayload = {
      appId: appId ?? null,
      isAutoUpdating,
      ...(organizationId ? {organizationId} : {}),
      ...(projectId ? {projectId} : {}),
      type: 'studio',
      version,
      ...toWorkbenchPayload(workbench, {interfaces, title: appTitle}),
    }

    // Dry run stops here — everything below mutates.
    if (dryRun) return {application: null, payload}

    // A real deploy has already exited if anything failed; landing here without a
    // resolved version means the deploy target was never resolved.
    if (!version) return

    const studioManifest = await uploadStudioSchema(options, {
      applicationId: workbench ? applicationId : undefined,
      isExternal: isLegacyExternal,
    })
    // The studio was created (or resolved from `deployment.appId`) before the
    // build, so this only ships the deployment; plain studios use user-applications.
    if (workbench && organizationId && applicationId) {
      if (!mfManifest) throw new Error('The federated build produced no manifest.')
      await deployWorkbenchApp({
        access: toAccess(studioManifest),
        app: cliConfig.app,
        applicationId,
        icon: appIcon,
        isApp: false,
        isAutoUpdating,
        isExternal: isExternallyHosted,
        label: 'Deploying studio',
        mfManifest,
        // Once the deployment is live, a metadata-sync failure must not delete
        // the studio.
        onDeployed: () => {
          rollbackApp = undefined
        },
        slug: workbench.slug,
        sourceDir,
        title: appTitle,
        version,
        visibility: workbench.visibility,
        workspaces: toWorkspaces(studioManifest),
      })
      const url = getApplicationUrl({
        id: applicationId,
        organizationId,
        slug: workbench.slug,
        type: 'studio',
      })
      logWorkbenchStudioDeployed({applicationId, cliConfig, output, url})
      if (isExternallyHosted)
        logExternalHost({built: flags.build, organizationId, output, sourceDir})
      return {
        action: applicationCreated ? 'create' : 'update',
        application: workbenchApp ?? null,
        payload,
        url,
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
      action: studioCreated ? 'create' : 'update',
      application,
      payload,
      url: location,
    }
  } catch (err) {
    await rollbackApp?.()
    throw err
  }
}

/**
 * Finds the application a real deploy targets, registering a studio host when
 * none is configured. A dry run resolves and reports the target read-only instead.
 */
async function resolveStudioApplication(
  options: DeployAppOptions,
  {dryRun, reporter}: {dryRun: boolean; reporter: DeployCheckReporter},
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
  {applicationId, isExternal}: {applicationId?: string; isExternal: boolean},
): Promise<StudioManifest | null> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options

  let studioManifest: StudioManifest | null = null
  try {
    studioManifest = await deployStudioSchemasAndManifests(
      {
        applicationId,
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
    if (error instanceof SchemaExtractionError && error.validation?.length) {
      output.error(formatSchemaValidation(error.validation), {exit: exitCodes.RUNTIME_ERROR})
    }
    // prettyPrintError renders the full cause chain (`Caused by: ...` lines),
    // which `${error}` would silently drop
    output.error(
      `Error deploying studio schemas and manifests: ${prettyPrintError(error) || String(error)}`,
      {
        exit: exitCodes.RUNTIME_ERROR,
      },
    )
  }

  if (!studioManifest) {
    output.error('Failed to generate studio manifest. Please check your schemas and manifests.', {
      exit: exitCodes.RUNTIME_ERROR,
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
    tarball = createTar({cwd: dirname(sourceDir)}, [basename(sourceDir)]).pipe(createGzip())
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

/**
 * One `datasets` access entry per unique workspace dataset, with a `resourceId`
 * of `"<projectId>.<dataset>"`. Deduped, since workspaces can share a dataset.
 */
function toAccess(manifest: StudioManifest | null): BrettAccess[] {
  const resourceIds = new Set(
    (manifest?.workspaces ?? []).map((w) => `${w.projectId}.${w.dataset}`),
  )
  return [...resourceIds].map(
    (resourceId) => ({resourceId, resourceType: 'dataset'}) satisfies BrettAccess,
  )
}

function toWorkspaces(manifest: StudioManifest | null): BrettWorkspace[] {
  return (manifest?.workspaces ?? []).map((workspace) => ({
    basePath: workspace.basePath,
    dataset: workspace.dataset,
    icon: workspace.icon,
    name: workspace.name,
    projectId: workspace.projectId,
    schemaDescriptorId: workspace.schemaDescriptorId,
    subtitle: workspace.subtitle,
    title: workspace.title,
  }))
}

/** Renders the workbench studio's deploy result; the appId hint shows only when none is configured. */
function logWorkbenchStudioDeployed({
  applicationId,
  cliConfig,
  output,
  url,
}: {
  applicationId: string
  cliConfig: DeployAppOptions['cliConfig']
  output: DeployAppOptions['output']
  url: string
}): void {
  output.log(`\nSuccess! Studio deployed to ${styleText('cyan', url)}`)
  if (getAppId(cliConfig)) return

  output.log(`\nAdd ${styleText('cyan', `appId: '${applicationId}'`)}`)
  output.log(`to the \`deployment\` section in sanity.cli.js or sanity.cli.ts`)
  output.log(`to avoid prompting for application id on next deploy.`)
}

/** Tells the customer what their host must do for the Dashboard to load the studio from it. */
function logExternalHost({
  built,
  organizationId,
  output,
  sourceDir,
}: {
  built: boolean
  organizationId: string
  output: DeployAppOptions['output']
  sourceDir: string
}): void {
  const dir = `${relative(process.cwd(), sourceDir) || '.'}/`
  output.log(`
The Dashboard loads this studio from your host, which must:
  1. Serve ${dir} unchanged at the root of its URL (/mf-manifest.json, /remoteEntry-*.js, /static/*)
  2. Send Access-Control-Allow-Origin for ${getWorkbenchUrl(organizationId)}
  3. Respond without cookies or a sign-in${built ? `\n\nThis deploy rebuilt ${dir}: copy it to your host before opening the studio in the Dashboard.` : ''}`)
}

function studioBuildSkipReason({
  build,
  isLegacyExternal,
}: {
  build: boolean
  isLegacyExternal: boolean
}) {
  if (isLegacyExternal) return 'Build skipped for externally hosted studios'
  if (!build) return 'Build skipped (--no-build) — validating existing output directory'
  return
}

/**
 * Determine if the blueprint being deployed is referenced by a blueprint.
 * @param projectRootDir - The root directory of the studio
 */
async function isBlueprintStudio(projectRootDir: string): Promise<boolean> {
  try {
    const blueprintFile = findBlueprintFile(projectRootDir)
    if (!blueprintFile) return false

    const localBlueprint = await readBlueprint({
      path: blueprintFile,
    })

    const blueprintReferencesStudio = localBlueprint.resources.some((r) => {
      if (r.type === 'sanity.studio' && 'root' in r && typeof r.root === 'string') {
        return relative(join(dirname(blueprintFile), r.root), projectRootDir) === ''
      }

      return false
    })

    return blueprintReferencesStudio
  } catch {
    return false // fail open
  }
}
