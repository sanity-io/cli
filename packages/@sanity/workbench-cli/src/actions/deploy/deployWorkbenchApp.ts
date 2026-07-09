import {basename, dirname} from 'node:path'
import {PassThrough} from 'node:stream'
import {createGzip, type Gzip} from 'node:zlib'

import {exitCodes, getGlobalCliClient, type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import FormData from 'form-data'
import {pack} from 'tar-fs'

import {APP_WORKBENCH_API_VERSION} from './apiVersion.js'
import {type BrettInterface} from './buildExposes.js'

export type ApplicationType = 'coreApp' | 'studio'

export interface Application {
  id: string
  organizationId: string
  slug: string | null
  title: string
  type: ApplicationType
}

export async function getApplication(applicationId: string): Promise<Application | null> {
  const client = await getGlobalCliClient({
    apiVersion: APP_WORKBENCH_API_VERSION,
    requireUser: true,
  })
  try {
    return await client.request({uri: `/applications/${applicationId}`})
  } catch (err) {
    if ((err as {statusCode?: number})?.statusCode === 404) return null
    throw err
  }
}

/** Create an application and its first deployment in one call. */
export async function createApplication(options: {
  interfaces: readonly BrettInterface[]
  isSingleton?: boolean
  organizationId: string
  projectId?: string
  slug: string
  tarball: Gzip
  title: string
  type: ApplicationType
  version: string
}): Promise<Application> {
  const {interfaces, isSingleton, organizationId, projectId, slug, tarball, title, type, version} =
    options
  const formData = new FormData()
  formData.append('type', type)
  formData.append('title', title)
  formData.append('organizationId', organizationId)
  formData.append('slug', slug)
  if (isSingleton !== undefined) formData.append('isSingleton', String(isSingleton))
  // Studio config is set once, at create — it's immutable on redeploy.
  if (projectId) appendJson(formData, 'config', {studio: {projectId}})
  appendDeploymentParts(formData, {interfaces, tarball, version})
  return request(`/applications`, formData)
}

/** Deploy a new active version to an existing application. */
export async function createDeployment(options: {
  applicationId: string
  interfaces: readonly BrettInterface[]
  isAutoUpdating: boolean
  tarball: Gzip
  version: string
}): Promise<{id: string}> {
  const {applicationId, interfaces, isAutoUpdating, tarball, version} = options
  const formData = new FormData()
  formData.append('isAutoUpdating', isAutoUpdating.toString())
  appendDeploymentParts(formData, {interfaces, tarball, version})
  return request(`/applications/${applicationId}/deployments`, formData)
}

function appendDeploymentParts(
  formData: FormData,
  {
    interfaces,
    tarball,
    version,
  }: {interfaces: readonly BrettInterface[]; tarball: Gzip; version: string},
): void {
  formData.append('version', version)
  appendJson(formData, 'interfaces', interfaces)
  formData.append('tarball', tarball, {contentType: 'application/gzip', filename: 'app.tar.gz'})
}

/** Structured parts must arrive as JSON so the server parses them. */
function appendJson(formData: FormData, name: string, value: unknown): void {
  formData.append(name, JSON.stringify(value), {contentType: 'application/json'})
}

async function request<T>(uri: string, formData: FormData): Promise<T> {
  const client = await getGlobalCliClient({
    apiVersion: APP_WORKBENCH_API_VERSION,
    requireUser: true,
  })
  return client.request({
    body: formData.pipe(new PassThrough()),
    headers: formData.getHeaders(),
    method: 'POST',
    uri,
  })
}

/**
 * Deploy a workbench coreApp through Brett: redeploy when `appId` is set,
 * otherwise create the application at `slug`. Returns the application id for the
 * shell to report.
 * @internal
 */
export async function deployCoreApp(options: {
  appId: string | undefined
  interfaces: readonly BrettInterface[]
  isAutoUpdating: boolean
  isSingleton?: boolean
  organizationId: string
  slug: string
  sourceDir: string
  title: string
  version: string
}): Promise<{applicationId: string}> {
  const {
    appId,
    interfaces,
    isAutoUpdating,
    isSingleton,
    organizationId,
    slug,
    sourceDir,
    title,
    version,
  } = options
  const tarball = pack(dirname(sourceDir), {entries: [basename(sourceDir)]}).pipe(createGzip())

  const spin = spinner('Deploying...').start()
  try {
    if (appId) {
      await createDeployment({applicationId: appId, interfaces, isAutoUpdating, tarball, version})
      spin.succeed()
      return {applicationId: appId}
    }

    const {id} = await createApplication({
      interfaces,
      isSingleton,
      organizationId,
      slug,
      tarball,
      title,
      type: 'coreApp',
      version,
    })
    spin.succeed()
    return {applicationId: id}
  } catch (error) {
    spin.clear()
    throw error
  }
}

/**
 * Deploy a workbench studio through Brett: redeploy when `appId` is set,
 * otherwise create the studio at `studioHost`. Returns the application id for
 * the shell to report; a missing `studioHost` on create is a usage error.
 * @internal
 */
export async function deployStudio(options: {
  appId: string | undefined
  interfaces: readonly BrettInterface[]
  isAutoUpdating: boolean
  organizationId: string
  output: Output
  projectId: string | undefined
  sourceDir: string
  studioHost: string | undefined
  title: string
  version: string
}): Promise<{applicationId: string}> {
  const {
    appId,
    interfaces,
    isAutoUpdating,
    organizationId,
    output,
    projectId,
    sourceDir,
    studioHost,
    title,
    version,
  } = options
  const tarball = pack(dirname(sourceDir), {entries: [basename(sourceDir)]}).pipe(createGzip())

  const spin = spinner('Deploying to sanity.studio').start()
  try {
    if (appId) {
      await createDeployment({applicationId: appId, interfaces, isAutoUpdating, tarball, version})
      spin.succeed()
      return {applicationId: appId}
    }

    if (!studioHost) {
      spin.fail()
      return output.error(
        'No studio hostname configured. Set `studioHost` in sanity.cli.ts to create a studio.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    const application = await createApplication({
      interfaces,
      organizationId,
      projectId,
      slug: studioHost,
      tarball,
      title,
      type: 'studio',
      version,
    })
    spin.succeed()
    return {applicationId: application.id}
  } catch (error) {
    spin.fail()
    throw error
  }
}
