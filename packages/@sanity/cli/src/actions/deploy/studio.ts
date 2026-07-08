// Deploys a plain (non-workbench) studio to sanity.studio hosting, or
// registers an externally hosted one (--external: no build, no upload).

import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip, type Gzip} from 'node:zlib'

import {
  checkProjectId,
  type DeployAdapter,
  type DeployAppOptions,
  type DeployCheck,
  type DeployResult,
  type DeployState,
  type TargetCheck,
} from '@sanity/cli-core/deploy'
import {spinner} from '@sanity/cli-core/ux'
import {type StudioManifest} from 'sanity'
import {pack} from 'tar-fs'

import {createDeployment, type UserApplication} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {
  checkAutoUpdates,
  checkOutputDir,
  checkPackageVersion,
  checkStudioBuild,
  checkStudioTarget,
} from './checks.js'
import {createStudioUserApplication} from './createUserApplication.js'
import {deployDebug} from './deployDebug.js'
import {uploadStudioSchema} from './deployStudioSchemasAndManifests.js'
import {findUserApplicationForStudio} from './findUserApplication.js'

const STUDIO_PACKAGE = 'sanity'

interface StudioState extends DeployState {
  application: UserApplication | null
  autoUpdatesEnabled: boolean
}

export const studioAdapter: DeployAdapter<'studio', StudioState> = {
  acquireTarget,
  check,
  checkOutput,
  deploy,
  describeTarget,
  type: 'studio',
}

async function check(
  options: DeployAppOptions,
): Promise<{checks: DeployCheck[]; state: StudioState}> {
  const {cliConfig, flags, projectRoot} = options
  const checks: DeployCheck[] = []

  const autoUpdates = checkAutoUpdates({cliConfig, flags})
  checks.push(...autoUpdates.checks)

  const pkg = await checkPackageVersion({
    moduleName: STUDIO_PACKAGE,
    workDir: projectRoot.directory,
  })
  checks.push(pkg.check, checkProjectId(cliConfig.api?.projectId))

  return {
    checks,
    state: {
      application: null,
      autoUpdatesEnabled: autoUpdates.enabled,
      // An external studio hosts its own files, so there is nothing to upload.
      uploadsFiles: !flags.external,
      version: pkg.version,
    },
  }
}

function describeTarget(options: DeployAppOptions): Promise<TargetCheck | null> {
  const {cliConfig, flags} = options
  return checkStudioTarget({
    appId: getAppId(cliConfig),
    isExternal: !!flags.external,
    projectId: cliConfig.api?.projectId,
    studioHost: cliConfig.studioHost,
    title: flags.title?.trim() || undefined,
    urlFlag: flags.url,
  })
}

/** Finds the application the deploy targets, registering a studio host (prompting if needed) when none exists. */
async function acquireTarget(options: DeployAppOptions, state: StudioState): Promise<StudioState> {
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
  return {...state, application}
}

async function checkOutput(
  options: DeployAppOptions,
  state: StudioState,
): Promise<{checks: DeployCheck[]; state: StudioState}> {
  const isExternal = !!options.flags.external
  const checks: DeployCheck[] = [
    await checkStudioBuild(options, {autoUpdatesEnabled: state.autoUpdatesEnabled, isExternal}),
  ]

  if (!isExternal) {
    const outputDir = await checkOutputDir(options.sourceDir)
    if (outputDir) checks.push(outputDir)
  }

  return {checks, state}
}

async function deploy(
  options: DeployAppOptions,
  state: StudioState,
): Promise<DeployResult<'studio'> | undefined> {
  const isExternal = !!options.flags.external
  const {application, version} = state
  if (!application || !version) return

  const studioManifest = await uploadStudioSchema(options, {isExternal})
  const location = await ship({
    application,
    isAutoUpdating: state.autoUpdatesEnabled,
    isExternal,
    options,
    studioManifest,
    version,
  })

  return {
    applicationType: 'studio',
    applicationVersion: version,
    target: {applicationId: application.id, title: application.title ?? null, url: location},
  }
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
