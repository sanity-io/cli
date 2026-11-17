import {styleText} from 'node:util'

import {logSymbols} from '@sanity/cli-core/ux'

import {getOrganization} from '../../services/organizations.js'
import {getCurrentUser} from '../../services/users.js'
import {formatSummary, SUMMARY_LOOKUP_TIMEOUT_MS} from '../summary.js'

export async function fetchDeploySummaryDetails(organizationId: string) {
  const signal = AbortSignal.timeout(SUMMARY_LOOKUP_TIMEOUT_MS)
  const [organizationName, userName] = await Promise.all([
    getOrganization(organizationId, signal)
      .then((org) => org.name)
      .catch(() => null),
    getCurrentUser(signal)
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
  const {applicationId, created, durationMs, isApp, showAppIdHint, title, url, userName} = options

  const summary = formatSummary({
    durationMs,
    heading: `${title} deployed`,
    isApp,
    organization: options.organizationName ?? options.organizationId,
    title,
    url,
    version: userName ? `just now by ${userName}` : 'just now',
  })
  const result = created
    ? `Created ${title} as a new ${isApp ? 'application' : 'studio'}.`
    : `Updated ${title}.`
  const success = styleText('green', `  ${logSymbols.success} ${result}`)
  const appIdHint = showAppIdHint
    ? `\n  ${styleText('dim', 'Add')} deployment.appId: "${applicationId}" ${styleText('dim', 'to sanity.cli.ts so the next deploy updates it')}\n`
    : ''

  return `${summary}
${success}
${appIdHint}`
}
