import {styleText} from 'node:util'

import {logSymbols} from '@sanity/cli-core/ux'

import {
  fetchOrganizationName,
  formatDashboardSummary,
  request,
  settle,
} from '../dashboardSummary.js'

export async function formatDeploySummary(options: {
  applicationId: string
  configFile: string
  created: boolean
  durationMs: number
  hasAppId: boolean
  isApp: boolean
  organizationId: string
  title: string
  url: string
}): Promise<string> {
  const {applicationId, configFile, created, hasAppId, isApp, organizationId, title, ...rest} =
    options

  const [organizationName, userName] = await Promise.all([
    fetchOrganizationName(organizationId),
    settle(request<{name: string}>('/users/me').then((user) => user.name)),
  ])

  const kind = isApp ? 'application' : 'studio'
  const result = created ? `Created ${title} as a new ${kind}.` : `Updated ${title} ${kind}.`
  const lines = [
    formatDashboardSummary({
      ...rest,
      action: 'deployed',
      isApp,
      organizationName,
      title,
      version: userName ? `just now by ${userName}` : 'just now',
    }),
    styleText('green', `  ${logSymbols.success} ${result}`),
    '',
  ]

  if (!hasAppId) {
    lines.push(
      `  ${styleText('dim', 'Add')} deployment.appId: ${styleText('dim', `"${applicationId}" to ${configFile}`)}`,
      '',
    )
  }

  return lines.join('\n')
}
