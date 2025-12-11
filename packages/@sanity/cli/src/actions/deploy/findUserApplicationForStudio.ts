/**
 * Helper functions to find a user application for a Sanity studio.
 */

import {select, Separator} from '@inquirer/prompts'
import {type Output, spinner} from '@sanity/cli-core'
import {type Ora} from 'ora'

import {
  createUserApplication,
  getUserApplication,
  getUserApplications,
  type UserApplication,
} from '../../services/userApplications.js'
import {deployDebug} from './deployDebug.js'

interface FindUserApplicationForStudioOptions {
  output: Output
  projectId: string

  appHost?: string
  appId?: string
}

export async function findUserApplicationForStudio(options: FindUserApplicationForStudioOptions) {
  const {appHost, appId, output, projectId} = options

  const spin = spinner('Checking project info').start()

  const userApplication = await findUserApplication({
    appHost,
    appId,
    output,
    projectId,
    spin,
  })

  spin.succeed()

  if (userApplication) {
    return userApplication
  }

  // No user application found, so let's list out the existing user applications
  // along with an option to create a new one
  let userApplications: Array<UserApplication> = []

  // Get existing user applications (if any),
  // based on the configured project ID
  if (projectId) {
    userApplications = await getUserApplications({
      appType: 'studio',
      projectId,
    })
  }

  // If no applications are found, return null
  if (!userApplications?.length) {
    return null
  }

  // If there are user applications, allow the user to select one of the existing host names,
  // or to create a new one
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

  // Otherwise, return the selected user application
  return userApplications.find((app) => app.appHost === selected)!
}

interface FindUserApplicationFromConfigOptions {
  output: Output
  projectId: string
  spin: Ora

  appHost?: string
  appId?: string
}

// formerly getOrCreateStudioFromConfig
async function findUserApplication(
  options: FindUserApplicationFromConfigOptions,
): Promise<UserApplication | null> {
  const {appHost, appId, output, projectId} = options
  let {spin} = options

  let userApplication: UserApplication | null = null

  // If the config has an appId, check for apps with that ID
  if (appId) {
    try {
      userApplication = await getUserApplication({appId, isSdkApp: false})

      if (userApplication) {
        return userApplication
      }

      // If appID is specified but no app is found with it, throw an error
      throw new Error(`Cannot find app with app ID ${appId}`)
    } catch (error) {
      spin.fail()
      deployDebug('Error finding user application', error)
      output.error(`Error finding user application: ${error?.message}`, {exit: 1})
    }
  }

  // As a fallback, if studioHost (deprecated) is configured, check for apps with that host
  if (appHost) {
    try {
      userApplication = await getUserApplication({appHost})

      // We've found the application — return it
      if (userApplication) {
        return userApplication
      }

      // Otherwise, try to create an app with the configured host
      try {
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
        // otherwise, it's a fatal error
        deployDebug('Error creating user application from config', e)
        output.error(
          `Error creating user application from config: ${e instanceof Error ? e.message : e}`,
          {exit: 1},
        )
      }
    } catch (error) {
      spin.fail()
      deployDebug('Error finding user application', error)
      output.error(
        `Error finding user application: ${error instanceof Error ? error.message : error.toString()}`,
        {exit: 1},
      )
    }
  }

  // If no appID and no appHost, just return and proceed to check for studios with the project ID
  return null
}
