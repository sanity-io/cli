/**
 * Finds the user application an app deploy targets — the interactive adapter
 * that turns the resolveAppDeployTarget verdicts into prompts and exits.
 */

import {type CliConfig, exitCodes, type Output} from '@sanity/cli-core'
import {select, Separator, spinner} from '@sanity/cli-core/ux'

import {type UserApplication} from '../../services/userApplications.js'
import {checkForDeprecatedAppId, getAppId} from '../../util/appId.js'
import {APP_ID_NOT_FOUND_IN_ORGANIZATION} from '../../util/errorMessages.js'
import {deployDebug} from './deployDebug.js'
import {resolveAppDeployTarget} from './resolveDeployTarget.js'

interface FindUserApplicationForAppOptions {
  cliConfig: CliConfig
  organizationId: string
  output: Output

  unattended?: boolean
}

export async function findUserApplicationForApp(
  options: FindUserApplicationForAppOptions,
): Promise<UserApplication | null> {
  const {cliConfig, organizationId, output, unattended = false} = options

  const spin = spinner('Checking application info...').start()

  try {
    checkForDeprecatedAppId({cliConfig, output})

    deployDebug('Resolving the deploy target from the local app config')
    const resolution = await resolveAppDeployTarget({appId: getAppId(cliConfig), organizationId})
    deployDebug('Resolved app deploy target', resolution)

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
