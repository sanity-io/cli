/**
 * Finds (or creates) the user application a deploy targets — the interactive
 * adapter that turns the resolveDeployTarget verdicts into prompts, creation,
 * and exits. Dry runs consume the same verdicts read-only (see deployChecks).
 */

import {type CliConfig, exitCodes, type Output} from '@sanity/cli-core'
import {select, Separator, spinner} from '@sanity/cli-core/ux'

import {createUserApplication, type UserApplication} from '../../services/userApplications.js'
import {checkForDeprecatedAppId, getAppId} from '../../util/appId.js'
import {
  APP_ID_NOT_FOUND_IN_ORGANIZATION,
  cannotPromptForStudioHost,
} from '../../util/errorMessages.js'
import {deployDebug} from './deployDebug.js'
import {resolveAppDeployTarget, resolveStudioDeployTarget} from './resolveDeployTarget.js'

interface FindUserApplicationOptions {
  cliConfig: CliConfig
  organizationId: string
  output: Output

  unattended?: boolean
}

export async function findUserApplication(
  options: FindUserApplicationOptions,
): Promise<UserApplication | null> {
  const {cliConfig, organizationId, output, unattended = false} = options

  // May throw when both app.id (deprecated) and deployment.appId are set — let
  // it surface with its own exit code rather than get re-wrapped below.
  checkForDeprecatedAppId({cliConfig, output})

  const spin = spinner('Checking application info...').start()

  let resolution
  try {
    deployDebug('Resolving the deploy target from the local app config')
    resolution = await resolveAppDeployTarget({appId: getAppId(cliConfig), organizationId})
    deployDebug('Resolved app deploy target', resolution)
  } catch (error) {
    // User can't access applications for the org
    if (error?.statusCode === 403) {
      spin.clear()
      deployDebug(
        'User does not have permission to get applications for the org, or the org ID is malformed/doesn’t exist',
        error,
      )
      output.error(
        `You don’t have permission to view applications for the configured organization ID ("${organizationId}")`,
        {
          exit: 1,
          suggestions: [
            'Verify that you’ve entered the correct organization ID',
            'Ask your Sanity organization’s admin to provide you with the proper permissions',
          ],
        },
      )
      return null
    }

    // We've failed for some other reason
    spin.clear()
    deployDebug('Error finding user application for app', error)
    output.error(error)
    return null
  }

  switch (resolution.type) {
    // The deploy validates organizationId before resolving, so this shouldn't happen
    case 'blocked': {
      spin.clear()
      output.error(resolution.message, {exit: 1})
      return null
    }
    case 'found': {
      spin.succeed()
      return resolution.application
    }
    // The provided application ID doesn't exist in the org
    case 'invalid': {
      spin.clear()
      output.error(APP_ID_NOT_FOUND_IN_ORGANIZATION, {
        exit: 1,
        suggestions: ['Verify the appId in your configuration matches an existing application'],
      })
      return null
    }
    case 'needs-input': {
      spin.info('No application ID configured')
      // Nobody to prompt in unattended mode — a real deploy would hang otherwise
      if (unattended) {
        output.error(
          'No `deployment.appId` configured. Set it in sanity.cli.ts to deploy without prompting.',
          {exit: exitCodes.USAGE_ERROR},
        )
        return null
      }
      return promptForExistingApp(resolution.existing)
    }
    // No appId configured and no existing applications — the deploy creates one
    case 'would-create': {
      spin.info('No application ID configured')
      // Creating one needs an interactive title prompt, which unattended can't answer
      if (unattended) {
        output.error(
          'No application to deploy to. Run `sanity deploy` interactively once to create one.',
          {exit: exitCodes.USAGE_ERROR},
        )
        return null
      }
      return null
    }
  }
}

interface FindUserApplicationForStudioOptions {
  isExternal: boolean
  output: Output
  projectId: string

  appId?: string
  studioHost?: string
  unattended?: boolean
  urlFlag?: string
}

export async function findUserApplicationForStudio(
  options: FindUserApplicationForStudioOptions,
): Promise<UserApplication | null> {
  const {appId, isExternal, output, projectId, studioHost, unattended = false, urlFlag} = options
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
  } catch (error) {
    spin.fail()
    deployDebug('Error finding user application', error)
    output.error(
      `Error finding user application: ${error instanceof Error ? error.message : String(error)}`,
      {exit: 1},
    )
    return null
  }

  deployDebug('Resolved studio deploy target', resolution)

  switch (resolution.type) {
    case 'blocked': {
      // The deploy validates projectId before resolving, so this shouldn't happen
      spin.fail()
      output.error(resolution.message, {exit: 1})
      return null
    }
    case 'found': {
      spin.succeed()
      return resolution.application
    }
    case 'invalid': {
      spin.fail()
      if (resolution.reason === 'invalid-host') {
        output.error(resolution.message, {exit: exitCodes.USAGE_ERROR})
      } else {
        output.error(`Error finding user application: ${resolution.message}`, {exit: 1})
      }
      return null
    }
    case 'needs-input': {
      spin.succeed()
      const {existing} = resolution

      // In unattended mode there is nobody to ask
      if (unattended) {
        output.error(cannotPromptForStudioHost(isExternal), {exit: exitCodes.USAGE_ERROR})
        return null
      }

      // Nothing to select from — the caller prompts for a brand new host
      if (existing.length === 0) {
        return null
      }

      return promptForExistingStudio({existing, urlType})
    }
    case 'would-create': {
      spin.succeed()
      return createFromConfiguredHost({appHost: resolution.appHost, output, projectId, urlType})
    }
  }
}

/**
 * The host is configured (studioHost or --url) but not registered yet:
 * a deploy registers it without prompting.
 */
async function createFromConfiguredHost({
  appHost,
  output,
  projectId,
  urlType,
}: {
  appHost: string
  output: Output
  projectId: string
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
      body: {appHost, type: 'studio', urlType},
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

async function promptForExistingApp(existing: UserApplication[]): Promise<UserApplication | null> {
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
