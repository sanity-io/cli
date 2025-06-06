import {type SanityClient} from '@sanity/client'

import {debug} from '../debug.js'

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
  client: SanityClient

  appHost?: string
  appId?: string
}

export async function getUserApplication({
  appHost,
  appId,
  client,
}: GetUserApplicationOptions): Promise<UserApplication | null> {
  let uri = '/user-applications'
  let query: Record<string, string | string[]>
  if (appId) {
    uri = `/user-applications/${appId}`
    query = {appType: 'coreApp'}
  } else if (appHost) {
    query = {appHost}
  } else {
    query = {default: 'true'}
  }

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
  client: SanityClient
}

export async function deleteUserApplication({
  applicationId,
  appType,
  client,
}: DeleteUserApplicationOptions): Promise<void> {
  await client.request({
    method: 'DELETE',
    query: {appType},
    uri: `/user-applications/${applicationId}`,
  })
}
