import {styleText} from 'node:util'

import {getGlobalCliClient} from '@sanity/cli-core'

const API_VERSION = 'v2025-05-14'
const REQUEST_TIMEOUT_MS = 3000

export function formatDashboardSummary(options: {
  action: 'deployed' | 'ready'
  durationMs: number
  isApp: boolean
  organizationName?: string
  title?: string
  url: string
  version?: string
}): string {
  const {action, durationMs, isApp, organizationName, title, url, version} = options

  const rows: Array<[string, string]> = []
  if (organizationName) rows.push(['Organization', organizationName])
  if (title) rows.push([isApp ? 'App' : 'Studio', title])
  rows.push(['URL', styleText(['blue', 'underline'], url)])
  if (version) rows.push(['Version', version])

  const width = Math.max(...rows.map(([label]) => label.length))

  return [
    '',
    `  Sanity Dashboard ${action} in ${(durationMs / 1000).toFixed(1)}s`,
    '',
    ...rows.map(([label, value]) => `    ${label.padEnd(width)}  ${value}`),
    '',
  ].join('\n')
}

export function fetchOrganizationName(organizationId: string): Promise<string | undefined> {
  return settle(request<{name: string}>(`/organizations/${organizationId}`).then((org) => org.name))
}

export async function settle<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise
  } catch {
    return
  }
}

export async function request<T>(url: string): Promise<T> {
  const client = await getGlobalCliClient({apiVersion: API_VERSION, requireUser: true})

  return client.request<T>({maxRetries: 0, timeout: REQUEST_TIMEOUT_MS, url})
}
