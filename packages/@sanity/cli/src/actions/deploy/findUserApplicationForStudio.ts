/**
 * Helper functions to find a user application for a Sanity studio.
 */

import {select, Separator} from '@inquirer/prompts'
import {type Ora} from 'ora'

import {type CliConfig} from '../../config/cli/types.js'
import {spinner} from '../../core/spinner.js'
import {
  createUserApplication,
  getUserApplication,
  getUserApplications,
  type UserApplication,
} from '../../services/userApplications.js'
import {type Output} from '../../types.js'
import {deployDebug} from './deployDebug.js'

interface FindUserApplicationForStudioOptions {
  cliConfig: CliConfig
  output: Output
  projectId: string
}

export async function findUserApplicationForStudio(options: FindUserApplicationForStudioOptions) {
  const {cliConfig, output, projectId} = options
  const configStudioHost = cliConfig.studioHost

  const spin = spinner('Checking project info').start()

  const userApplication = await findUserApplication({
    appHost: configStudioHost,
    output,
    projectId,
    spin,
  })

  spin.succeed()

  if (userApplication) {
    return userApplication
  }

  // If the userApplication is not found, we need to create it
  // Show a list of existing applications to select from
  const userApplications = await getUserApplications({
    appType: 'studio',
    projectId,
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
      {name: 'Create new studio hostname', value: 'NEW_STUDIO'},
      new Separator(),
      ...choices,
    ],
    message: 'Select existing studio hostname',
  })

  // If the user wants to create a new deployed application, return null
  if (selected === 'NEW_STUDIO') {
    return null
  }

  return userApplications.find((app) => app.appHost === selected)!
}

interface FindUserApplicationFromConfigOptions {
  output: Output
  projectId: string
  spin: Ora

  appHost?: string
}

async function findUserApplication(
  options: FindUserApplicationFromConfigOptions,
): Promise<UserApplication | null> {
  const {appHost, output, projectId} = options
  let {spin} = options

  let userApplication: UserApplication | null = null
  // If the appHost is provided, we need to check if it's already taken
  if (appHost) {
    try {
      userApplication = await getUserApplication({
        appHost,
        projectId,
      })

      if (userApplication) {
        return userApplication
      }
    } catch (error) {
      spin.fail()

      deployDebug('Error finding user application', error)
      output.error('Error finding user application', {exit: 1})
    }

    // Complete the spinner
    spin.stop()

    try {
      // If the appHost is not taken, we need to create it
      output.log('Your project has not been assigned a studio hostname.')
      output.log(`Creating https://${appHost}.sanity.studio`)
      output.log('')
      spin = spinner('Creating studio hostname').start()

      const response = await createUserApplication({
        appType: 'studio',
        body: {
          appHost,
          type: 'studio',
          urlType: 'internal',
        },
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
      deployDebug('Error creating user application from config', e)
      // otherwise, it's a fatal error
      output.error('Error creating user application from config', {exit: 1})
    }
  }

  return getUserApplication({projectId})
}
