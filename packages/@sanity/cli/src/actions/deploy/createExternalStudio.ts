import {createUserApplication, type UserApplication} from '../../services/userApplications.js'
import {normalizeUrl, validateUrl} from '../../util/externalStudioUrls.js'
import {deployDebug} from './deployDebug.js'

export async function createExternalStudio({
  appHost,
  projectId,
}: {
  appHost: string
  projectId: string
}): Promise<UserApplication> {
  const validationResult = validateUrl(appHost)
  if (validationResult !== true) {
    throw new Error(validationResult)
  }

  const normalizedUrl = normalizeUrl(appHost)

  try {
    return await createUserApplication({
      appType: 'studio',
      body: {
        appHost: normalizedUrl,
        type: 'studio',
        urlType: 'external',
      },
      projectId,
    })
  } catch (e) {
    deployDebug('Error creating external user application', e)
    if ([402, 409].includes(e?.statusCode)) {
      throw new Error(e?.response?.body?.message || 'Bad request')
    }
    throw e
  }
}
