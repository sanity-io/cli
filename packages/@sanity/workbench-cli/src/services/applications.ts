import {PassThrough} from 'node:stream'
import {type Gzip} from 'node:zlib'

import {type AppVisibility, getGlobalCliClient} from '@sanity/cli-core'
import {isStaging} from '@sanity/cli-core/util'
import FormData from 'form-data'

import {type AppInterfaceMetadata} from '../contract.js'
import {APP_WORKBENCH_API_VERSION} from './apiVersion.js'

export type ApplicationType = 'coreApp' | 'studio'

export interface Application {
  id: string
  organizationId: string
  slug: string | null
  title: string
  type: ApplicationType
}

interface BrettInterfaceBase {
  moduleId: string
  name: string
  title: string
  version: string
}

/**
 * An interface as Brett stores it, discriminated on `type`. `moduleId` is
 * remote-relative — the host prepends the app's id. Brett assigns the id.
 * @internal
 */
export type BrettInterface =
  | (BrettInterfaceBase & {metadata: AppInterfaceMetadata | null; type: 'app'})
  | (BrettInterfaceBase & {metadata: null; type: 'panel'})
  | (BrettInterfaceBase & {metadata: null; type: 'worker'})

/** A studio workspace as Brett stores it. */
export interface BrettWorkspace {
  dataset: string
  projectId: string

  basePath?: string
  icon?: string
  name?: string
  subtitle?: string
  title?: string
}

export function getWorkbenchUrl(organizationId: string): string {
  return `https://${organizationId}.${isStaging() ? 'run.sanity.work' : 'sanity.run'}`
}

/** Where a deployed application is served on its organization's workbench. */
export function getApplicationUrl(
  application: Pick<Application, 'id' | 'organizationId' | 'type'>,
): string {
  const segment = application.type === 'studio' ? 'studio' : 'application'
  return `${getWorkbenchUrl(application.organizationId)}/${segment}/${application.id}`
}

async function getClient() {
  return getGlobalCliClient({apiVersion: APP_WORKBENCH_API_VERSION, requireUser: true})
}

export async function getApplication(applicationId: string): Promise<Application | null> {
  const client = await getClient()
  try {
    return await client.request({uri: `/applications/${applicationId}`})
  } catch (err) {
    if ((err as {statusCode?: number})?.statusCode === 404) return null
    throw err
  }
}

/** Create an application and its first deployment in one call. */
export async function createApplication(options: {
  icon?: string
  interfaces: readonly BrettInterface[]
  isSingleton?: boolean
  organizationId: string
  projectId?: string
  slug: string
  tarball: Gzip
  title: string
  type: ApplicationType
  version: string
  visibility?: AppVisibility
  workspaces?: readonly BrettWorkspace[]
}): Promise<Application> {
  const {
    icon,
    interfaces,
    isSingleton,
    organizationId,
    projectId,
    slug,
    tarball,
    title,
    type,
    version,
    visibility,
    workspaces,
  } = options
  const formData = new FormData()
  formData.append('type', type)
  formData.append('title', title)
  formData.append('organizationId', organizationId)
  formData.append('slug', slug)
  if (isSingleton !== undefined) formData.append('isSingleton', String(isSingleton))
  if (visibility) formData.append('visibility', visibility)
  // Studio config is set once, at create — it's immutable on redeploy.
  if (projectId) appendJson(formData, 'config', {studio: {projectId}})
  // Application-level JSON part, independent of the deployment.
  if (icon) appendJson(formData, 'icon', icon)
  appendDeploymentParts(formData, {interfaces, tarball, version, workspaces})
  return request(`/applications`, formData)
}

/** Mutable application fields the deploy flow patches after create. */
export interface ApplicationUpdate {
  icon?: string | null
  title?: string
}

/**
 * Patch an application's mutable fields. The deploy endpoint ignores these, so a
 * redeploy syncs the title (and icon) from config here alongside the new deployment.
 */
export async function updateApplication(
  applicationId: string,
  update: ApplicationUpdate,
): Promise<void> {
  const client = await getClient()
  await client.request({body: update, method: 'PATCH', uri: `/applications/${applicationId}`})
}

/** Deploy a new active version to an existing application. */
export async function createDeployment(options: {
  applicationId: string
  interfaces: readonly BrettInterface[]
  isAutoUpdating: boolean
  tarball: Gzip
  version: string
  workspaces?: readonly BrettWorkspace[]
}): Promise<{id: string}> {
  const {applicationId, interfaces, isAutoUpdating, tarball, version, workspaces} = options
  const formData = new FormData()
  formData.append('isAutoUpdating', isAutoUpdating.toString())
  appendDeploymentParts(formData, {interfaces, tarball, version, workspaces})
  return request(`/applications/${applicationId}/deployments`, formData)
}

/** Soft-deletes the application and all its deployments; already deleted counts as done. */
export async function deleteApplication(applicationId: string): Promise<void> {
  const client = await getClient()
  try {
    await client.request({method: 'DELETE', uri: `/applications/${applicationId}`})
  } catch (err) {
    if ((err as {statusCode?: number})?.statusCode !== 404) throw err
  }
}

function appendDeploymentParts(
  formData: FormData,
  {
    interfaces,
    tarball,
    version,
    workspaces,
  }: {
    interfaces: readonly BrettInterface[]
    tarball: Gzip
    version: string
    workspaces?: readonly BrettWorkspace[]
  },
): void {
  formData.append('version', version)
  appendJson(formData, 'interfaces', interfaces)
  // Studio-only — the server rejects a workspaces part on non-studio types.
  if (workspaces?.length) appendJson(formData, 'workspaces', workspaces)
  formData.append('tarball', tarball, {contentType: 'application/gzip', filename: 'app.tar.gz'})
}

/** Structured parts must arrive as JSON so the server parses them. */
function appendJson(formData: FormData, name: string, value: unknown): void {
  formData.append(name, JSON.stringify(value), {contentType: 'application/json'})
}

async function request<T>(uri: string, formData: FormData): Promise<T> {
  const client = await getClient()
  return client.request({
    body: formData.pipe(new PassThrough()),
    headers: formData.getHeaders(),
    method: 'POST',
    uri,
  })
}
