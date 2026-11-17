import {styleText} from 'node:util'

import {logSymbols} from '@sanity/cli-core/ux'

import {getOrganization} from '../../services/organizations.js'
import {getCurrentUser} from '../../services/users.js'

const DETAILS_TIMEOUT_MS = 3000

export async function fetchDeploySummaryDetails(organizationId: string) {
  const signal = AbortSignal.timeout(DETAILS_TIMEOUT_MS)
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
  const {applicationId, created, durationMs, isApp, organizationId, showAppIdHint, title, url} =
    options

  const seconds = (durationMs / 1000).toFixed(1)
  const organization = options.organizationName ?? organizationId
  const kind = isApp ? 'App' : 'Studio'
  const link = styleText(['blue', 'underline'], url)
  const version = options.userName ? `just now by ${options.userName}` : 'just now'
  const result = created
    ? `Created ${title} as a new ${isApp ? 'application' : 'studio'}.`
    : `Updated ${title}.`
  const success = styleText('green', `  ${logSymbols.success} ${result}`)
  const appIdHint = showAppIdHint
    ? `\n  ${styleText('dim', 'Add')} deployment.appId: "${applicationId}" ${styleText('dim', 'to sanity.cli.ts so the next deploy updates it')}\n`
    : ''

  return `
  ${title} deployed in ${seconds}s

    Organization  ${organization}
    ${kind.padEnd(12)}  ${title}
    URL           ${link}
    Version       ${version}

${success}
${appIdHint}`
}
