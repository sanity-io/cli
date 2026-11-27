import {PassThrough} from 'node:stream'
import {type Gzip} from 'node:zlib'

import {getGlobalCliClient} from '@sanity/cli-core'
import FormData from 'form-data'

import {APP_WORKBENCH_API_VERSION} from './apiVersion.js'

export interface Dashboard {
  id: string
}

async function getClient() {
  return getGlobalCliClient({apiVersion: APP_WORKBENCH_API_VERSION, requireUser: true})
}

export async function getOrganizationDashboard(
  organizationId: string,
): Promise<Dashboard | undefined> {
  const client = await getClient()
  const {data}: {data: Dashboard[]} = await client.request({
    query: {organizationId},
    url: '/applications/dashboards',
  })
  return data[0]
}

export async function createDashboard(organizationId: string): Promise<Dashboard> {
  const client = await getClient()
  return client.request({
    body: {organizationId},
    method: 'POST',
    url: '/applications/dashboards',
  })
}

export async function createDashboardConfig(
  dashboardId: string,
  {tarball, version}: {tarball: Gzip; version: string},
): Promise<void> {
  const formData = new FormData()
  formData.append('version', version)
  formData.append('tarball', tarball, {
    contentType: 'application/gzip',
    filename: 'dashboard-config.tar.gz',
  })

  const client = await getClient()
  await client.request({
    body: formData.pipe(new PassThrough()),
    headers: formData.getHeaders(),
    method: 'POST',
    url: `/applications/dashboards/${dashboardId}/configs`,
  })
}

export async function deleteDashboard(dashboardId: string): Promise<void> {
  const client = await getClient()
  await client.request({method: 'DELETE', url: `/applications/dashboards/${dashboardId}`})
}
