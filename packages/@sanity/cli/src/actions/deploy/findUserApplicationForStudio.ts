/**
 * Helper functions to find a user application for a Sanity studio.
 */

import {type Output} from '@sanity/cli-core'
import {select, Separator, spinner, type SpinnerInstance} from '@sanity/cli-core/ux'

import {
  createUserApplication,
  getUserApplication,
  getUserApplications,
  type UserApplication,
} from '../../services/userApplications.js'
import {deployDebug} from './deployDebug.js'
import {normalizeUrl, validateUrl} from './urlUtils.js'

interface FindUserApplicationForStudioOptions {
  output: Output
  projectId: string

  appHost?: string
  appId?: string
  urlType?: 'external' | 'internal'
}

export async function findUserApplicationForStudio(options: FindUserApplicationForStudioOptions) {
  const {appHost, appId, output, projectId, urlType = 'internal'} = options

  const spin = spinner('Checking project info').start()

  const userApplication = await findUserApplication({
    appHost,
    appId,
    output,
    projectId,
    spin,
    urlType,
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
    const allApps = await getUserApplications({
      appType: 'studio',
      projectId,
    })
    // Filter by urlType so external deploys only see external studios and vice versa
    userApplications = allApps?.filter((app) => app.urlType === urlType) ?? []
  }

  // If no applications are found, return null
  if (!userApplications?.length) {
    return null
  }

  // If there are user applications, allow the user to select one of the existing host names,
  // or to create a new one
  const newLabel =
    urlType === 'external' ? 'Register new external studio URL' : 'Create new studio hostname'
  const selectMessage =
    urlType === 'external'
      ? 'Select existing external studio, or register a new one'
      : 'Select existing studio hostname, or create a new one'

  const choices = userApplications.map((app) => ({
    name: app.title ?? app.appHost,
    value: app.appHost,
  }))

  const selected = await select({
    choices: [{name: newLabel, value: 'NEW_STUDIO'}, new Separator(), ...choices],
    message: selectMessage,
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
  spin: SpinnerInstance
  urlType: 'external' | 'internal'

  appHost?: string
  appId?: string
}

async function findUserApplication(
  options: FindUserApplicationFromConfigOptions,
): Promise<UserApplication | null> {
  const {appHost, appId, output, projectId, urlType} = options
  let {spin} = options

  let userApplication: UserApplication | null = null

  // If the config has an appId, check for apps with that ID
  if (appId) {
    try {
      userApplication = await getUserApplication({appId, isSdkApp: false, projectId})

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
    // For external URLs, validate and normalize before lookup/creation
    const resolvedHost = urlType === 'external' ? normalizeUrl(appHost) : appHost

    if (urlType === 'external') {
      const validation = validateUrl(resolvedHost)
      if (validation !== true) {
        spin.fail()
        output.error(validation, {exit: 1})
        return null
      }
    }

    try {
      userApplication = await getUserApplication({
        appHost: resolvedHost,
        isSdkApp: false,
        projectId,
      })

      // We've found the application — return it
      if (userApplication) {
        return userApplication
      }

      // Otherwise, try to create an app with the configured host
      try {
        if (urlType === 'external') {
          output.log('Your project has not been registered with an external studio URL.')
          output.log(`Registering ${resolvedHost}`)
        } else {
          output.log('Your project has not been assigned a studio hostname.')
          output.log(`Creating https://${resolvedHost}.sanity.studio`)
        }
        output.log('')
        spin = spinner(
          urlType === 'external' ? 'Registering external studio' : 'Creating studio hostname',
        ).start()

        const response = await createUserApplication({
          appType: 'studio',
          body: {
            appHost: resolvedHost,
            type: 'studio',
            urlType,
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
