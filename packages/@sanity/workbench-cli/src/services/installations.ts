import {PassThrough} from 'node:stream'
import {type Gzip} from 'node:zlib'

import {getGlobalCliClient} from '@sanity/cli-core'
import FormData from 'form-data'

import {APP_WORKBENCH_API_VERSION} from './apiVersion.js'

export interface ConfigSnapshot {
  id: string

  createdAt?: string
  deployedBy?: string
  /** Whether this snapshot is the one being served; at most one per installation. */
  isActive?: boolean
}

interface InstallationListItem {
  id: string

  application?: {slug?: string}
}

async function getClient() {
  return getGlobalCliClient({apiVersion: APP_WORKBENCH_API_VERSION, requireUser: true})
}

/** The org's active singleton installation, matched on its slug. */
export async function resolveSingletonInstallationId(
  organizationId: string,
  slug: string,
): Promise<string | undefined> {
  const client = await getClient()
  // `limit=none` returns every installation in one response, no pagination.
  const {data}: {data: InstallationListItem[]} = await client.request({
    query: {limit: 'none', organizationId},
    uri: '/installations',
  })
  return data.find((item) => item.application?.slug === slug)?.id
}

/** Upload a config snapshot to the installation as a multipart tarball. */
export async function createConfig(
  installationId: string,
  {tarball, version}: {tarball: Gzip; version: string},
): Promise<void> {
  const formData = new FormData()
  formData.append('version', version)
  formData.append('tarball', tarball, {
    contentType: 'application/gzip',
    filename: 'installation-config.tar.gz',
  })

  const client = await getClient()
  await client.request({
    body: formData.pipe(new PassThrough()),
    headers: formData.getHeaders(),
    method: 'POST',
    uri: `/installations/${installationId}/configs`,
  })
}

/** The installation's deployed config snapshots, newest first. */
export async function listConfigs(installationId: string): Promise<ConfigSnapshot[]> {
  const client = await getClient()
  const {data}: {data: ConfigSnapshot[]} = await client.request({
    query: {limit: 'none'},
    uri: `/installations/${installationId}/configs`,
  })
  return data
}

/**
 * Soft-deletes one config snapshot; its content is purged once superseded.
 * Already deleted counts as done, so a partially-failed undeploy can re-run.
 */
export async function deleteConfig(installationId: string, configId: string): Promise<void> {
  const client = await getClient()
  try {
    await client.request({
      method: 'DELETE',
      uri: `/installations/${installationId}/configs/${configId}`,
    })
  } catch (err) {
    if ((err as {statusCode?: number})?.statusCode !== 404) throw err
  }
}
