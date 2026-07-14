import {getGlobalCliClient} from '@sanity/cli-core'

import {APP_WORKBENCH_API_VERSION} from '../actions/deploy/apiVersion.js'

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
