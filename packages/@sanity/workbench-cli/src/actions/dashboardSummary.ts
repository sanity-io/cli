import {styleText} from 'node:util'

import {getGlobalCliClient} from '@sanity/cli-core'

const API_VERSION = 'v2025-05-14'
const REQUEST_TIMEOUT_MS = 3000

export function formatDashboardSummary(options: {
  durationMs: number
  heading: string
  isApp: boolean
  organizationId?: string
  organizationName?: string | null
  title?: string
  url: string
  version?: string | null
}): string {
  const {durationMs, heading, isApp, organizationId, organizationName, title, url, version} =
    options
  const organization = organizationName ?? organizationId

  const rows: Array<[string, string]> = []
  if (organization) rows.push(['Organization', organization])
  if (title) rows.push([isApp ? 'App' : 'Studio', title])
  rows.push(['URL', styleText(['blue', 'underline'], url)])
  if (version) rows.push(['Version', version])

  const width = Math.max(...rows.map(([label]) => label.length))

  return [
    '',
    `  ${heading} in ${(durationMs / 1000).toFixed(1)}s`,
    '',
    ...rows.map(([label, value]) => `    ${label.padEnd(width)}  ${value}`),
    '',
  ].join('\n')
}

export async function request<T>(url: string): Promise<T> {
  const client = await getGlobalCliClient({apiVersion: API_VERSION, requireUser: true})

  return client.request<T>({maxRetries: 0, timeout: REQUEST_TIMEOUT_MS, url})
}
