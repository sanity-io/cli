import {PassThrough} from 'node:stream'
import {type Gzip} from 'node:zlib'

import {debug, getGlobalCliClient} from '@sanity/cli-core'
import FormData from 'form-data'

export const USER_APPLICATIONS_API_VERSION = 'v2024-08-01'

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

export interface UserApplication {
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

export async function getUserApplication(options: {appId: string}): Promise<UserApplication | null>
export async function getUserApplication(options: {
  appHost: string
  projectId: string
}): Promise<UserApplication | null>
export async function getUserApplication(options: {
  projectId: string
}): Promise<UserApplication | null>
export async function getUserApplication({
  appHost,
  appId,
  projectId,
}: {
  appHost?: string
  appId?: string
  projectId?: string
}): Promise<UserApplication | null> {
  let uri = '/user-applications'
  let query: Record<string, string | string[]>
  if (appId) {
    uri = `/user-applications/${appId}`
    query = {appType: 'coreApp'}
  } else if (appHost) {
    uri = `/projects/${projectId}/user-applications`
    query = {appHost, appType: 'studio'}
  } else {
    uri = `/projects/${projectId}/user-applications`
    query = {default: 'true'}
  }

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

export async function getUserApplications(options: {
  appType: 'studio'
  projectId: string
}): Promise<UserApplication[]>
export async function getUserApplications(options: {
  appType: 'coreApp'
  organizationId: string
}): Promise<UserApplication[]>
export async function getUserApplications(
  options:
    | {
        appType: 'coreApp'
        organizationId?: string
      }
    | {
        appType: 'studio'
        projectId?: string
      },
): Promise<UserApplication[] | null> {
  const {appType} = options
  const client = await getGlobalCliClient({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    requireUser: true,
  })

  if (appType === 'studio') {
    const {projectId} = options as {appType: 'studio'; projectId?: string}
    return await client.request({
      query: {appType: 'studio'},
      uri: `/projects/${projectId}/user-applications`,
    })
  }

  const {organizationId} = options as {appType: 'coreApp'; organizationId?: string}

  try {
    return await client.request({
      query: {appType: 'coreApp', organizationId: organizationId!},
      uri: `/user-applications`,
    })
  } catch (error) {
    // User doesn't have permission to view applications for the org,
    // or the organization ID doesn’t exist
    if (error?.statusCode === 403) {
      throw error
    }

    debug('Error finding user applications', error)
    return null
  }
}

export async function createUserApplication(options: {
  appType: 'coreApp'
  body: Pick<UserApplication, 'appHost' | 'type' | 'urlType'> & {
    title?: string
  }
  organizationId?: string
}): Promise<UserApplication>
export async function createUserApplication(options: {
  appType: 'studio'
  body: Pick<UserApplication, 'appHost' | 'type' | 'urlType'> & {
    title?: string
  }
  projectId: string
}): Promise<UserApplication>
export async function createUserApplication(options: {
  appType: 'coreApp' | 'studio'
  body: Pick<UserApplication, 'appHost' | 'type' | 'urlType'> & {
    title?: string
  }
  organizationId?: string
  projectId?: string
}): Promise<UserApplication> {
  const {appType, body} = options

  const client = await getGlobalCliClient({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    requireUser: true,
  })

  let uri
  let query

  // If we have an organizationId, we're creating a core app
  if (appType === 'coreApp') {
    const {organizationId} = options as {appType: 'coreApp'; organizationId?: string}
    uri = '/user-applications'
    query = {appType: 'coreApp', organizationId: organizationId!}
  } else {
    const {projectId} = options as {appType: 'studio'; projectId?: string}
    uri = `/projects/${projectId}/user-applications`
    query = {appType: 'studio'}
  }

  return client.request({body, method: 'POST', query, uri})
}

interface CreateDeploymentOptions {
  applicationId: string
  isAutoUpdating: boolean
  tarball: Gzip
  version: string

  isApp?: boolean

  projectId?: string
}

export async function createDeployment({
  applicationId,
  isApp,
  isAutoUpdating,
  projectId,
  tarball,
  version,
}: CreateDeploymentOptions): Promise<{location: string}> {
  const client = await getGlobalCliClient({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    requireUser: true,
  })

  const formData = new FormData()
  formData.append('isAutoUpdating', isAutoUpdating.toString())
  formData.append('version', version)
  formData.append('tarball', tarball, {contentType: 'application/gzip', filename: 'app.tar.gz'})

  let uri
  let query

  if (isApp) {
    uri = `/user-applications/${applicationId}/deployments`
    query = {appType: 'coreApp'}
  } else {
    uri = `/projects/${projectId}/user-applications/${applicationId}/deployments`
    query = {appType: 'studio'}
  }

  return client.request({
    body: formData.pipe(new PassThrough()),
    headers: formData.getHeaders(),
    method: 'POST',
    query,
    uri,
  })
}
