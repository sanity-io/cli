import {styleText} from 'node:util'

import {logSymbols} from '@sanity/cli-core/ux'

import {
  fetchOrganizationName,
  formatDashboardSummary,
  request,
  settle,
} from '../dashboardSummary.js'

export async function fetchDeploySummaryDetails(organizationId: string) {
  const [organizationName, userName] = await Promise.all([
    fetchOrganizationName(organizationId),
    settle(request<{name: string}>('/users/me').then((user) => user.name)),
  ])

  return {organizationName, userName}
}

export function formatDeploySummary(options: {
  applicationId: string
  created: boolean
  durationMs: number
  isApp: boolean
  organizationId: string
  organizationName?: string
  title: string
  url: string
  userName?: string
}): string {
  const {applicationId, created, isApp, title, userName, ...rest} = options

  const result = created
    ? `Created ${title} as a new ${isApp ? 'application' : 'studio'}.`
    : `Updated ${title}.`
  const lines = [
    formatDashboardSummary({
      ...rest,
      heading: `${title} deployed`,
      isApp,
      title,
      version: userName ? `just now by ${userName}` : 'just now',
    }),
    styleText('green', `  ${logSymbols.success} ${result}`),
    '',
  ]

  if (created) {
    lines.push(
      `  ${styleText('dim', 'Add')} deployment.appId: "${applicationId}" ${styleText('dim', 'to sanity.cli.ts so the next deploy updates it')}`,
      '',
    )
  }

  return lines.join('\n')
}
