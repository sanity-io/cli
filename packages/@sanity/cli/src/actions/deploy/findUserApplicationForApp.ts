/**
 * Helper functions to find a user application for a Sanity application.
 */

import {type CliConfig, type Output} from '@sanity/cli-core'
import {select, Separator, spinner} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {
  getUserApplication,
  getUserApplications,
  type UserApplication,
} from '../../services/userApplications.js'
import {checkForDeprecatedAppId, getAppId} from '../../util/appId.js'
import {deployDebug} from './deployDebug.js'

interface FindUserApplicationForAppOptions {
  cliConfig: CliConfig
  organizationId: string
  output: Output
}

/**
 * Find a user application for a Sanity application.
 */
export async function findUserApplicationForApp(
  options: FindUserApplicationForAppOptions,
): Promise<UserApplication | null> {
  const {cliConfig, organizationId, output} = options

  const spin = spinner('Checking application info...').start()

  try {
    checkForDeprecatedAppId({cliConfig, output})

    deployDebug('Checking for a user application as specified in the local app config')
    const userApplication = await findUserApplication(options)

    if (userApplication) {
      deployDebug('Found a user application as configured')
      spin.succeed()
      return userApplication
    }

    const appId = getAppId(cliConfig)

    // If there's an appId in the application config but there's no userApplication,
    // then the provided application ID doesn’t exist in the org
    if (appId) {
      spin.clear()
      output.error(
        'The `appId` provided in your configuration’s `deployment` object cannot be found in your organization',
        {
          exit: 1,
          suggestions: ['Verify the appId in your configuration matches an existing application'],
        },
      )
      return null
    }

    // Done checking local application info
    // Update the spinner text to indicate the next operation
    spin.text = 'No application ID configured; checking for existing applications...'

    // Get a list of existing applications to select from.
    // This will fail if the org ID is malformed or the user doesn’t have access to the org ID
    const userApplications = await getUserApplications({
      appType: 'coreApp',
      organizationId,
    })

    // If no applications are found, return null
    if (!userApplications?.length) {
      return null
    }

    // No app ID configured, done checking for existing applications;
    // retain this spinner text for clarity
    spin.info('No application ID configured')

    // Enumerate the available applications
    const choices = userApplications.map((app) => ({
      name: app.title ?? app.appHost,
      value: app.appHost,
    }))

    // Ask the user to select an existing app or create a new one
    const selected = await select({
      choices: [
        {name: 'New application deployment', value: 'NEW_APP'},
        new Separator(' ════ Existing applications: ════ '),
        ...choices,
      ],
      loop: false,
      message:
        'Would you like to create a new application deployment, or deploy to an existing one?',
      pageSize: 10,
    })

    // If the user wants to create a new deployed application, return null
    if (selected === 'NEW_APP') {
      return null
    }

    return userApplications.find((app) => app.appHost === selected)!
  } catch (error) {
    // User can't access applications for the org
    if (isHttpError(error) && error.statusCode === 403) {
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
    output.error(error instanceof Error ? error : String(error))
    return null
  }
}

function findUserApplication(
  options: FindUserApplicationForAppOptions,
): Promise<UserApplication | null> | null {
  const {cliConfig} = options

  const appId = getAppId(cliConfig)

  if (!appId) {
    return null
  }

  return getUserApplication({appId, isSdkApp: true})
}
