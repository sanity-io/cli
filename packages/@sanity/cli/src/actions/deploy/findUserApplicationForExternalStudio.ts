/**
 * Helper functions to find or create a user application for an externally hosted Sanity studio.
 */

import {type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {getUserApplication, type UserApplication} from '../../services/userApplications.js'
import {normalizeUrl, validateUrl} from '../../util/externalStudioUrls.js'
import {createExternalStudio} from './createExternalStudio.js'
import {deployDebug} from './deployDebug.js'

interface FindUserApplicationForExternalStudioOptions {
  output: Output
  projectId: string

  appHost?: string
  appId?: string
}

export async function findUserApplicationForExternalStudio(
  options: FindUserApplicationForExternalStudioOptions,
): Promise<UserApplication> {
  const {appHost, appId, output, projectId} = options

  const spin = spinner('Checking project info').start()

  if (appId) {
    const userApplication = await getUserApplication({appId, isSdkApp: false, projectId})
    spin.succeed()

    if (userApplication) {
      return userApplication
    }

    throw new Error(`Application not found. Application with id ${appId} does not exist`)
  }

  if (appHost) {
    const validationResult = validateUrl(appHost)
    if (validationResult !== true) {
      spin.fail()
      throw new Error(validationResult)
    }

    const normalizedUrl = normalizeUrl(appHost)
    const userApplication = await getUserApplication({
      appHost: normalizedUrl,
      isSdkApp: false,
      projectId,
    })
    spin.succeed()

    if (userApplication) {
      return userApplication
    }

    output.log(`Registering external studio at ${normalizedUrl}`)
    output.log('')
    spin.start('Registering external studio URL')

    try {
      const response = await createExternalStudio({appHost: normalizedUrl, projectId})
      spin.succeed()
      return response
    } catch (e) {
      spin.fail()
      deployDebug('Error registering external studio', e)
      throw e
    }
  }

  spin.fail()
  throw new Error(
    'External deployment requires studioHost to be set in sanity.cli.ts with a full URL, or deployment.appId to reference an existing application',
  )
}
