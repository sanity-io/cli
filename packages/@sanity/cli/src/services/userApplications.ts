import {getGlobalCliClient} from '../core/apiClient.js'
import {debug} from '../debug.js'

const USER_APPLICATIONS_API_VERSION = 'v2024-08-01'

interface ActiveDeployment {
  createdAt: string
  deployedAt: string
  deployedBy: string
  isActiveDeployment: boolean
  isAutoUpdating: boolean | null
  size: string | null
  updatedAt: string
  version: string
}

interface UserApplication {
  appHost: string
  createdAt: string
  id: string
  organizationId: string | null
  projectId: string | null
  title: string | null
  type: 'coreApp' | 'studio'
  updatedAt: string
  urlType: 'external' | 'internal'

  activeDeployment?: ActiveDeployment | null
}

interface GetUserApplicationOptions {
  appHost?: string
  appId?: string
}

export async function getUserApplication({
  appHost,
  appId,
}: GetUserApplicationOptions): Promise<UserApplication | null> {
  let uri = '/user-applications'
  let query: Record<string, string | string[]>
  if (appId) {
    uri = `/user-applications/${appId}`
    query = {appType: 'coreApp'}
  } else if (appHost) {
    query = {appHost, appType: 'studio'}
  } else {
    query = {default: 'true'}
  }

  console.log(query, uri)

  const client = await getGlobalCliClient({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    requireUser: true,
  })

  try {
    return await client.request({query, uri})
  } catch (err) {
    if (err?.statusCode === 404) {
      return null
    }

    debug('Error getting user application', err)
    throw err
  }
}

interface DeleteUserApplicationOptions {
  applicationId: string
  appType: 'coreApp' | 'studio'
}

export async function deleteUserApplication({
  applicationId,
  appType,
}: DeleteUserApplicationOptions): Promise<void> {
  const client = await getGlobalCliClient({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    requireUser: true,
  })

  await client.request({
    method: 'DELETE',
    query: {appType},
    uri: `/user-applications/${applicationId}`,
  })
}
