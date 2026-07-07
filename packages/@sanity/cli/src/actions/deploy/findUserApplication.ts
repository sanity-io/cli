/**
 * Finds (or creates) the user application a deploy targets — the interactive
 * adapter that turns the resolveDeployTarget verdicts into prompts, creation,
 * and exits. Dry runs consume the same verdicts read-only (see deployChecks).
 */

import {type CliConfig, type Output} from '@sanity/cli-core/types'
import {select, Separator, spinner} from '@sanity/cli-core/ux'

import {
  createUserApplication,
  type UserApplication,
  type UserApplicationResolved,
} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {
  createFailFastReporter,
  describeAppTarget,
  describeAppTargetError,
  describeStudioTarget,
} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {resolveAppDeployTarget, resolveStudioDeployTarget} from './resolveDeployTarget.js'

interface FindUserApplicationOptions {
  cliConfig: CliConfig
  organizationId: string
  output: Output

  title?: string
  unattended?: boolean
}

export async function findUserApplication(
  options: FindUserApplicationOptions,
): Promise<UserApplicationResolved | null> {
  const {cliConfig, organizationId, output, title, unattended = false} = options
  const spin = spinner('Checking application info...').start()

  let resolution
  try {
    resolution = await resolveAppDeployTarget({appId: getAppId(cliConfig), organizationId})
    deployDebug('Resolved app deploy target', resolution)
  } catch (error) {
    spin.clear()
    deployDebug('Error finding user application for app', error)
    output.error(describeAppTargetError(error, organizationId), {exit: 1})
    return null
  }

  if (resolution.type === 'found') {
    spin.succeed()
    return resolution.application
  }

  // null tells the caller to create. Unattended runs can only create with a
  // --title; picking among existing apps (needs-input) always needs a prompt.
  if (resolution.type === 'would-create' && (!unattended || title)) {
    spin.info('No application ID configured')
    return null
  }
  if (resolution.type === 'needs-input' && !unattended) {
    spin.info('No application ID configured')
    return promptForExistingApp(resolution.existing)
  }

  spin.clear()
  // 'blocked' diagnoses as a skip (its root cause fails an earlier check), so it
  // needs an explicit exit here to not fall through to application creation
  if (resolution.type === 'blocked') {
    output.error(resolution.message, {exit: 1})
    return null
  }
  createFailFastReporter(output).report(describeAppTarget(resolution))
  return null
}

interface FindUserApplicationForStudioOptions {
  isExternal: boolean
  output: Output
  projectId: string

  appId?: string
  studioHost?: string
  title?: string
  unattended?: boolean
  urlFlag?: string
}

export async function findUserApplicationForStudio(
  options: FindUserApplicationForStudioOptions,
): Promise<UserApplication | null> {
  const {
    appId,
    isExternal,
    output,
    projectId,
    studioHost,
    title,
    unattended = false,
    urlFlag,
  } = options
  const urlType = isExternal ? 'external' : 'internal'
  const spin = spinner('Checking project info').start()

  let resolution
  try {
    resolution = await resolveStudioDeployTarget({
      appId,
      isExternal,
      projectId,
      studioHost,
      urlFlag,
    })
    deployDebug('Resolved studio deploy target', resolution)
  } catch (error) {
    spin.fail()
    deployDebug('Error finding user application', error)
    output.error(`Failed to resolve deploy target: ${getErrorMessage(error)}`, {exit: 1})
    return null
  }

  if (resolution.type === 'found') {
    spin.succeed()
    return resolution.application
  }

  // The configured host isn't registered yet — a deploy registers it without prompting
  if (resolution.type === 'would-create') {
    spin.succeed()
    return createFromConfiguredHost({
      appHost: resolution.appHost,
      output,
      projectId,
      title,
      urlType,
    })
  }

  if (resolution.type === 'needs-input' && !unattended) {
    spin.succeed()
    // Nothing to select from — the caller prompts for a brand new host
    if (resolution.existing.length === 0) return null
    return promptForExistingStudio({existing: resolution.existing, urlType})
  }

  spin.fail()
  // 'blocked' diagnoses as a skip (its root cause fails an earlier check), so it
  // needs an explicit exit here
  if (resolution.type === 'blocked') {
    output.error(resolution.message, {exit: 1})
    return null
  }
  createFailFastReporter(output).report(describeStudioTarget(resolution, {isExternal}))
  return null
}

/**
 * The host is configured (studioHost or --url) but not registered yet:
 * a deploy registers it without prompting.
 */
async function createFromConfiguredHost({
  appHost,
  output,
  projectId,
  title,
  urlType,
}: {
  appHost: string
  output: Output
  projectId: string
  title?: string
  urlType: 'external' | 'internal'
}): Promise<UserApplication | null> {
  if (urlType === 'external') {
    output.log('Your project has not been registered with an external studio URL.')
    output.log(`Registering ${appHost}`)
  } else {
    output.log('Your project has not been assigned a studio hostname.')
    output.log(`Creating https://${appHost}.sanity.studio`)
  }
  output.log('')

  const spin = spinner(
    urlType === 'external' ? 'Registering external studio' : 'Creating studio hostname',
  ).start()

  try {
    const response = await createUserApplication({
      appType: 'studio',
      body: {appHost, title, type: 'studio', urlType},
      projectId,
    })
    spin.succeed()
    return response
  } catch (e) {
    spin.fail()
    // if the name is taken, it should return a 409 so we relay to the user
    if ([402, 409].includes(e?.statusCode)) {
      output.error(e?.response?.body?.message || 'Bad request', {exit: 1})
      return null
    }
    // otherwise, it's a fatal error
    deployDebug('Error creating user application from config', e)
    output.error(
      `Error creating user application from config: ${e instanceof Error ? e.message : e}`,
      {exit: 1},
    )
    return null
  }
}

async function promptForExistingApp(
  existing: UserApplicationResolved[],
): Promise<UserApplicationResolved | null> {
  const choices = existing.map((app) => ({name: app.title ?? app.appHost, value: app.appHost}))

  const selected = await select({
    choices: [
      {name: 'New application deployment', value: 'NEW_APP'},
      new Separator(' ════ Existing applications: ════ '),
      ...choices,
    ],
    loop: false,
    message: 'Would you like to create a new application deployment, or deploy to an existing one?',
    pageSize: 10,
  })

  if (selected === 'NEW_APP') {
    return null
  }

  return existing.find((app) => app.appHost === selected)!
}

async function promptForExistingStudio({
  existing,
  urlType,
}: {
  existing: UserApplication[]
  urlType: 'external' | 'internal'
}): Promise<UserApplication | null> {
  const newLabel =
    urlType === 'external' ? 'Register new external studio URL' : 'Create new studio hostname'
  const selectMessage =
    urlType === 'external'
      ? 'Select existing external studio, or register a new one'
      : 'Select existing studio hostname, or create a new one'

  const choices = existing.map((app) => ({name: app.title ?? app.appHost, value: app.appHost}))

  const selected = await select({
    choices: [{name: newLabel, value: 'NEW_STUDIO'}, new Separator(), ...choices],
    message: selectMessage,
  })

  if (selected === 'NEW_STUDIO') {
    return null
  }

  return existing.find((app) => app.appHost === selected)!
}
