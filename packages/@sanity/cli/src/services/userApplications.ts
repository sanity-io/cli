import {type SanityClient} from '@sanity/client'

import {subdebug} from '../debug.js'

const debug = subdebug('deploy')

export interface ActiveDeployment {
  deployedAt: string
  deployedBy: string
  isActiveDeployment: boolean
  isAutoUpdating: boolean | null
  size: string | null
  createdAt: string
  updatedAt: string
  version: string
}

export interface UserApplication {
  id: string
  projectId: string | null
  organizationId: string | null
  title: string | null
  appHost: string
  urlType: 'internal' | 'external'
  createdAt: string
  updatedAt: string
  type: 'studio' | 'coreApp'
  activeDeployment?: ActiveDeployment | null
}

export interface GetUserApplicationOptions {
  client: SanityClient
  appHost?: string
  appId?: string
}

export async function getUserApplication({
  client,
  appHost,
  appId,
}: GetUserApplicationOptions): Promise<UserApplication | null> {
  let uri = '/user-applications'
  let query: Record<string, string | undefined>
  if (appId) {
    uri = `/user-applications/${appId}`
    query = {appType: 'coreApp'}
  } else if (appHost) {
    query = {appHost}
  } else {
    query = {default: 'true'}
  }

  try {
    return await client.request({uri, query})
  } catch (err: any) {
    if (err?.statusCode === 404) {
      return null
    }

    debug('Error getting user application', err)
    throw err
  }
}

export interface DeleteUserApplicationOptions {
  client: SanityClient
  applicationId: string
  appType: 'coreApp' | 'studio'
}

export async function deleteUserApplication({
  client,
  applicationId,
  appType,
}: DeleteUserApplicationOptions): Promise<void> {
  await client.request({
    uri: `/user-applications/${applicationId}`,
    method: 'DELETE',
    query: {appType},
  })
}
