import {styleText} from 'node:util'

import {logSymbols} from '@sanity/cli-core/ux'

import {formatDashboardSummary, request} from '../dashboardSummary.js'

export async function fetchDeploySummaryDetails(organizationId: string) {
  const [organizationName, userName] = await Promise.all([
    request<{name: string}>(`/organizations/${organizationId}`)
      .then((org) => org.name)
      .catch(() => null),
    request<{name: string}>('/users/me')
      .then((user) => user.name)
      .catch(() => null),
  ])

  return {organizationName, userName}
}

export function formatDeploySummary(options: {
  applicationId: string
  created: boolean
  durationMs: number
  isApp: boolean
  organizationId: string
  organizationName?: string | null
  showAppIdHint: boolean
  title: string
  url: string
  userName?: string | null
}): string {
  const {applicationId, created, isApp, showAppIdHint, title, userName, ...rest} = options

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

  if (showAppIdHint) {
    lines.push(
      `  ${styleText('dim', 'Add')} deployment.appId: "${applicationId}" ${styleText('dim', 'to sanity.cli.ts so the next deploy updates it')}`,
      '',
    )
  }

  return lines.join('\n')
}
