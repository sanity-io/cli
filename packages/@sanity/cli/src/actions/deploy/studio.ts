// Deploys a plain (non-workbench) studio to sanity.studio hosting, or
// registers an externally hosted one (--external: no build, no upload).

import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip, type Gzip} from 'node:zlib'

import {spinner} from '@sanity/cli-core/ux'
import {type StudioManifest} from 'sanity'
import {pack} from 'tar-fs'

import {createDeployment, type UserApplication} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {
  checkAutoUpdates,
  checkOutputDir,
  checkPackageVersion,
  checkProjectId,
  checkStudioBuild,
  checkStudioTarget,
  type DeployCheck,
  enforce,
} from './checks.js'
import {createStudioUserApplication} from './createUserApplication.js'
import {deployDebug} from './deployDebug.js'
import {uploadStudioSchema} from './deployStudioSchemasAndManifests.js'
import {findUserApplicationForStudio} from './findUserApplication.js'
import {
  type DeployAdapter,
  type DeploymentPlan,
  type DeployResult,
  isDeployable,
  listDeploymentFiles,
  newPlan,
} from './runDeploy.js'
import {type DeployAppOptions} from './types.js'

const STUDIO_PACKAGE = 'sanity'

export const studioAdapter: DeployAdapter<'studio'> = {
  deploy,
  plan,
  type: 'studio',
}

async function plan(options: DeployAppOptions): Promise<DeploymentPlan<'studio'>> {
  const {cliConfig, flags, projectRoot, sourceDir} = options
  const workDir = projectRoot.directory
  const isExternal = !!flags.external
  const checks: DeployCheck[] = []

  const autoUpdates = checkAutoUpdates({cliConfig, flags})
  checks.push(...autoUpdates.checks)

  const pkg = await checkPackageVersion({moduleName: STUDIO_PACKAGE, workDir})
  checks.push(pkg.check, checkProjectId(cliConfig.api?.projectId))

  const resolved = await checkStudioTarget({
    appId: getAppId(cliConfig),
    isExternal,
    projectId: cliConfig.api?.projectId,
    studioHost: cliConfig.studioHost,
    title: flags.title?.trim() || undefined,
    urlFlag: flags.url,
  })
  checks.push(
    resolved.check,
    await checkStudioBuild(options, {autoUpdatesEnabled: autoUpdates.enabled, isExternal}),
  )

  if (!isExternal) {
    const outputDir = await checkOutputDir({isWorkbenchApp: false, sourceDir})
    if (outputDir) checks.push(outputDir)
  }

  const result = newPlan({checks, target: resolved.target, type: 'studio', version: pkg.version})
  // An external studio hosts its own files, so there is nothing to upload.
  if (!isExternal && isDeployable(result)) {
    result.files = await listDeploymentFiles(sourceDir, workDir)
  }
  return result
}

async function deploy(options: DeployAppOptions): Promise<DeployResult<'studio'> | undefined> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options
  const workDir = projectRoot.directory
  const isExternal = !!flags.external

  const autoUpdates = checkAutoUpdates({cliConfig, flags})
  for (const check of autoUpdates.checks) enforce(output, check)

  const pkg = await checkPackageVersion({moduleName: STUDIO_PACKAGE, workDir})
  enforce(output, pkg.check)
  if (!pkg.version) return

  enforce(output, checkProjectId(cliConfig.api?.projectId))

  const application = await resolveApplication(options)
  if (!application) return

  enforce(
    output,
    await checkStudioBuild(options, {autoUpdatesEnabled: autoUpdates.enabled, isExternal}),
  )

  if (!isExternal) {
    const outputDir = await checkOutputDir({isWorkbenchApp: false, sourceDir})
    if (outputDir) enforce(output, outputDir)
  }

  const studioManifest = await uploadStudioSchema(options, {isExternal})
  const location = await ship({
    application,
    isAutoUpdating: autoUpdates.enabled,
    isExternal,
    options,
    studioManifest,
    version: pkg.version,
  })

  return {
    applicationType: 'studio',
    applicationVersion: pkg.version,
    target: {applicationId: application.id, title: application.title ?? null, url: location},
  }
}

/** Finds the application the deploy targets, registering a studio host (prompting if needed) when none exists. */
async function resolveApplication(options: DeployAppOptions): Promise<UserApplication | null> {
  const {cliConfig, flags, output} = options
  const isExternal = !!flags.external
  const projectId = cliConfig.api?.projectId ?? ''
  const title = flags.title?.trim() || undefined

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

async function ship({
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
