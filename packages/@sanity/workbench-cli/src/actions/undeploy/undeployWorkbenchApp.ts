import {getGlobalCliClient} from '@sanity/cli-core'

import {APP_WORKBENCH_API_VERSION} from '../deploy/apiVersion.js'

export interface ConfigSnapshot {
  id: string

  createdAt?: string
  deployedBy?: string
  /** Whether this snapshot is the one being served; at most one per installation. */
  isActive?: boolean
}

async function getClient() {
  return getGlobalCliClient({apiVersion: APP_WORKBENCH_API_VERSION, requireUser: true})
}

/** Soft-deletes the application and all its deployments; already deleted counts as done. */
export async function deleteApplication(applicationId: string): Promise<void> {
  const client = await getClient()
  await ignoreNotFound(client.request({method: 'DELETE', uri: `/applications/${applicationId}`}))
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
  await ignoreNotFound(
    client.request({
      method: 'DELETE',
      uri: `/installations/${installationId}/configs/${configId}`,
    }),
  )
}

async function ignoreNotFound(request: Promise<unknown>): Promise<void> {
  try {
    await request
  } catch (err) {
    if ((err as {statusCode?: number})?.statusCode === 404) return
    throw err
  }
}
