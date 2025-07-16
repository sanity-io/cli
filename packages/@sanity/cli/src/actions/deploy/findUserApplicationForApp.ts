/**
 * Helper functions to find a user application for a Sanity application.
 */

import {select, Separator} from '@inquirer/prompts'

import {type CliConfig} from '../../config/cli/types.js'
import {spinner} from '../../core/spinner.js'
import {
  getUserApplication,
  getUserApplications,
  type UserApplication,
} from '../../services/userApplications.js'
import {type Output} from '../../types.js'
import {NO_ORGANIZATION_ID} from '../../util/errorMessages.js'
import {deployDebug} from './deployDebug.js'

interface FindUserApplicationForAppOptions {
  cliConfig: CliConfig
  output: Output
}

/**
 * Find a user application for a Sanity application.
 */
export async function findUserApplicationForApp(
  options: FindUserApplicationForAppOptions,
): Promise<UserApplication | null> {
  const {cliConfig, output} = options

  const spin = spinner('Checking application info').start()

  try {
    const userApplication = await findUserApplication(options)

    spin.succeed()
    if (userApplication) {
      return userApplication
    }

    output.log('The id provided in your configuration is not recognized.')
    output.log('Checking existing applications...')

    const organizationId = cliConfig.app?.organizationId

    if (!organizationId) {
      output.error(NO_ORGANIZATION_ID, {exit: 1})
      // This is unreachable, but we need to return a value to satisfy the type checker
      return null
    }

    // Show a list of existing applications to select from
    const userApplications = await getUserApplications({
      appType: 'coreApp',
      organizationId,
    })

    // If no applications are found, return null
    if (!userApplications?.length) {
      return null
    }

    const choices = userApplications.map((app) => ({
      name: app.title ?? app.appHost,
      value: app.appHost,
    }))

    const selected = await select({
      choices: [
        {name: 'Create new deployed application', value: 'NEW_APP'},
        new Separator(),
        ...choices,
      ],
      message: 'Select an existing deployed application',
    })

    // If the user wants to create a new deployed application, return null
    if (selected === 'NEW_APP') {
      return null
    }

    return userApplications.find((app) => app.appHost === selected)!
  } catch (error) {
    console.log(error)
    spin.fail()
    deployDebug('Failed to find user application for app', error)
    output.error('Failed to find user application for app', {exit: 1})
    return null
  }
}

function findUserApplication(options: FindUserApplicationForAppOptions) {
  const {cliConfig} = options

  const appId = cliConfig.app?.id

  if (!appId) {
    return null
  }

  return getUserApplication({
    appId,
  })
}
