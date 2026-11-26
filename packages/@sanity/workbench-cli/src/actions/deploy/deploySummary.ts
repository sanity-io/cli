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

const CREATED_AS = {config: '', coreApp: ' as a new application', studio: ' as a new studio'}

export function formatDeploySummary(
  options: (
    | {applicationId: string; showAppIdHint: boolean; type: 'coreApp' | 'studio'}
    | {type: 'config'}
  ) & {
    created: boolean
    durationMs: number
    organizationId: string
    organizationName?: string | null
    title: string
    url: string
    userName?: string | null
  },
): string {
  const {created, durationMs, title, url, userName} = options

  const summary = formatSummary({
    durationMs,
    heading: `${title} deployed`,
    isApp: options.type === 'coreApp',
    organization: options.organizationName ?? options.organizationId,
    // A config has no app or studio of its own to name.
    title: options.type === 'config' ? undefined : title,
    url,
    version: userName ? `just now by ${userName}` : 'just now',
  })
  const result = created ? `Created ${title}${CREATED_AS[options.type]}.` : `Updated ${title}.`
  const success = styleText('green', `  ${logSymbols.success} ${result}`)
  const appIdHint =
    options.type !== 'config' && options.showAppIdHint
      ? `\n  ${styleText('dim', 'Add')} deployment.appId: "${options.applicationId}" ${styleText('dim', 'to sanity.cli.ts so the next deploy updates it')}\n`
      : ''

  return `${summary}
${success}
${appIdHint}`
}

export function formatUndeploySummary(options: {
  durationMs: number
  organizationId: string
  organizationName?: string | null
  title: string
  url: string
}): string {
  const summary = formatSummary({
    durationMs: options.durationMs,
    heading: `${options.title} undeployed`,
    isApp: false,
    organization: options.organizationName ?? options.organizationId,
    url: options.url,
  })
  const success = styleText('green', `  ${logSymbols.success} Deleted ${options.title}.`)

  return `${summary}
${success}
`
}
