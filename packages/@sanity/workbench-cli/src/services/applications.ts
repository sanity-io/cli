import {PassThrough} from 'node:stream'
import {type Gzip} from 'node:zlib'

import {type AppVisibility, getGlobalCliClient} from '@sanity/cli-core'
import {isStaging} from '@sanity/cli-core/util'
import FormData from 'form-data'

import {type AppInterfaceMetadata, type TileInterfaceMetadata} from '../contract.js'
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
  | (BrettInterfaceBase & {metadata: null; type: 'asset_source'})
  | (BrettInterfaceBase & {metadata: null; type: 'panel'})
  | (BrettInterfaceBase & {metadata: null; type: 'worker'})
  | (BrettInterfaceBase & {metadata: TileInterfaceMetadata; type: 'tile'})

/**
 * A resource a deployment may interact with, as Brett stores it. Per-deployment
 * and forbidden for singletons (the server 400s).
 */
export interface BrettAccess {
  resourceId: string
  resourceType: 'canvas' | 'dashboard' | 'dataset' | 'media-library'
}

/** A studio workspace as Brett stores it. */
export interface BrettWorkspace {
  dataset: string
  projectId: string
  /** Lexicon schema descriptor id; Brett requires one per workspace. */
  schemaDescriptorId: string

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
    return await client.request({url: `/applications/${applicationId}`})
  } catch (err) {
    if ((err as {statusCode?: number})?.statusCode === 404) return null
    throw err
  }
}

/** Every application in an organization, in one page (`limit=none`). */
export async function listApplications(organizationId: string): Promise<Application[]> {
  const client = await getClient()
  const {data}: {data: Application[]} = await client.request({
    query: {limit: 'none', organizationId},
    url: '/applications',
  })
  return data
}

/**
 * Create an application record (no deployment), so the CLI can build with the
 * returned id, then ship it via {@link createDeployment}.
 */
export async function createApplication(options: {
  isSingleton?: boolean
  organizationId: string
  projectId?: string
  slug: string
  title: string
  type: ApplicationType
  visibility?: AppVisibility
}): Promise<Application> {
  const {isSingleton, organizationId, projectId, slug, title, type, visibility} = options
  const client = await getClient()
  return client.request({
    body: {
      organizationId,
      slug,
      title,
      type,
      ...(isSingleton === undefined ? {} : {isSingleton}),
      ...(visibility ? {visibility} : {}),
      // Studio config is set once, at create — it's immutable on redeploy.
      ...(projectId ? {config: {studio: {projectId}}} : {}),
    },
    method: 'POST',
    url: `/applications`,
  })
}

/** Mutable application fields the deploy flow patches after create. */
export interface ApplicationUpdate {
  icon?: string | null
  title?: string
  visibility?: AppVisibility
}

// Patch an application's mutable fields.
export async function updateApplication(
  applicationId: string,
  update: ApplicationUpdate,
): Promise<void> {
  const client = await getClient()
  await client.request({body: update, method: 'PATCH', url: `/applications/${applicationId}`})
}

/** Deploy a new active version to an existing application. */
export async function createDeployment(options: {
  access?: readonly BrettAccess[]
  applicationId: string
  interfaces: readonly BrettInterface[]
  isAutoUpdating: boolean
  tarball: Gzip
  version: string
  workspaces?: readonly BrettWorkspace[]
}): Promise<{id: string}> {
  const {access, applicationId, interfaces, isAutoUpdating, tarball, version, workspaces} = options
  const formData = new FormData()
  formData.append('isAutoUpdating', isAutoUpdating.toString())
  appendDeploymentParts(formData, {access, interfaces, tarball, version, workspaces})
  return request(`/applications/${applicationId}/deployments`, formData)
}

/** Soft-deletes the application and all its deployments; already deleted counts as done. */
export async function deleteApplication(applicationId: string): Promise<void> {
  const client = await getClient()
  try {
    await client.request({method: 'DELETE', url: `/applications/${applicationId}`})
  } catch (err) {
    if ((err as {statusCode?: number})?.statusCode !== 404) throw err
  }
}

function appendDeploymentParts(
  formData: FormData,
  {
    access,
    interfaces,
    tarball,
    version,
    workspaces,
  }: {
    access?: readonly BrettAccess[]
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
  // Per-deployment; forbidden for singletons, so callers omit it there.
  if (access?.length) appendJson(formData, 'access', access)
  formData.append('tarball', tarball, {contentType: 'application/gzip', filename: 'app.tar.gz'})
}

/** Structured parts must arrive as JSON so the server parses them. */
function appendJson(formData: FormData, name: string, value: unknown): void {
  formData.append(name, JSON.stringify(value), {contentType: 'application/json'})
}

async function request<T>(url: string, formData: FormData): Promise<T> {
  const client = await getClient()
  return client.request({
    body: formData.pipe(new PassThrough()),
    headers: formData.getHeaders(),
    method: 'POST',
    url,
  })
}
