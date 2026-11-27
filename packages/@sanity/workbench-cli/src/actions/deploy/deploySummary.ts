import {styleText} from 'node:util'

import {logSymbols} from '@sanity/cli-core/ux'

import {getOrganization} from '../../services/organizations.js'
import {getCurrentUser} from '../../services/users.js'
import {formatSummary, SUMMARY_LOOKUP_TIMEOUT_MS} from '../summary.js'

/**
 * The organization's name, and its host slug for Dashboard URLs. A failed or
 * slow (over 3s) lookup reads as `null`, so a deploy falls back to the org ID
 * host instead of failing.
 */
export async function fetchOrganizationSummary(organizationId: string) {
  const organization = await getOrganization(
    organizationId,
    AbortSignal.timeout(SUMMARY_LOOKUP_TIMEOUT_MS),
  ).catch(() => null)

  return {hostSlug: organization?.slug ?? null, organizationName: organization?.name ?? null}
}

/**
 * The organization and deployer for a deploy's summary. Pass the command's
 * {@link fetchOrganizationSummary} lookup to share it rather than look the org up again.
 */
export async function fetchDeploySummaryDetails(
  organizationId: string,
  organization?: ReturnType<typeof fetchOrganizationSummary>,
) {
  const [{hostSlug, organizationName}, userName] = await Promise.all([
    organization ?? fetchOrganizationSummary(organizationId),
    getCurrentUser(AbortSignal.timeout(SUMMARY_LOOKUP_TIMEOUT_MS))
      .then((user) => user.name)
      .catch(() => null),
  ])

  return {hostSlug, organizationName, userName}
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
