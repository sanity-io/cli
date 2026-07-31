import {subdebug} from '@sanity/cli-core/debug'
import {createRequester} from '@sanity/cli-core/request'
import {isStaging} from '@sanity/cli-core/util'

import {
  TERMS_OF_SERVICE_FALLBACK_NOTICE,
  TERMS_OF_SERVICE_FALLBACK_URL,
} from '../util/mintProjectConstants.js'

const debug = subdebug('new:provision')

/** Provision API version for minting unclaimed projects. */
export const PROVISION_API_VERSION = 'v2026-06-23'

const request = createRequester({middleware: {httpErrors: false, promise: {onlyBody: false}}})

export interface MintedProject {
  apiHost: string
  claimApiUrl: string
  claimToken: string
  claimUrl: string
  datasetName: string
  expiresAt: string
  resourceId: string
  /** Terms of Service accepted by using the project. Falls back to the bundled constants. */
  termsNotice: string
  termsUrl: string
  token: string
}

function getProvisionApiBase(): string {
  const override = process.env.SANITY_API_HOST
  if (override) return override.replace(/\/$/u, '')
  return isStaging() ? 'https://api.sanity.work' : 'https://api.sanity.io'
}

function parseJsonBody(body: unknown): unknown {
  if (typeof body !== 'string') return body

  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseProvisionResponse(body: unknown): MintedProject {
  const data = parseJsonBody(body)
  const response =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {}
  const links =
    response.links && typeof response.links === 'object' && !Array.isArray(response.links)
      ? (response.links as Record<string, unknown>)
      : {}
  const terms =
    response.terms && typeof response.terms === 'object' && !Array.isArray(response.terms)
      ? (response.terms as Record<string, unknown>)
      : {}

  const minted = {
    apiHost: getString(response.apiHost),
    claimApiUrl: getString(links.claimApiUrl),
    claimToken: getString(response.claimToken),
    claimUrl: getString(links.claimUrl),
    datasetName: getString(response.datasetName),
    expiresAt: getString(response.expiresAt),
    resourceId: getString(response.resourceId),
    token: getString(response.token),
  }
  const missing = Object.entries(minted)
    .filter(([, value]) => value === undefined)
    .map(([key]) => key)

  if (response.resourceType !== 'project') {
    missing.push('resourceType')
  }
  if (missing.length > 0) {
    throw new Error(`Project creation response is missing or invalid: ${missing.join(', ')}`)
  }

  return {
    ...(minted as Omit<MintedProject, 'termsNotice' | 'termsUrl'>),
    termsNotice: getString(terms.notice) ?? TERMS_OF_SERVICE_FALLBACK_NOTICE,
    termsUrl: getString(terms.url) ?? TERMS_OF_SERVICE_FALLBACK_URL,
  }
}

/**
 * Mint an unclaimed Sanity project through the public provision endpoint.
 */
export async function mintUnclaimedProject(options: {displayName: string}): Promise<MintedProject> {
  const displayName = options.displayName.trim()
  if (!displayName || displayName.length > 80) {
    throw new Error('Project name must be 1-80 characters.')
  }

  const url = `${getProvisionApiBase()}/${PROVISION_API_VERSION}/provision`
  debug('minting unclaimed project at %s', url)

  const response = await request({
    body: JSON.stringify({displayName, resourceType: 'project'}),
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
    url,
  })

  if (response.statusCode === 404) {
    throw new Error(
      'Creating projects without an account is currently unavailable. Try again later, or run `sanity login` and `sanity init`.',
    )
  }
  if (response.statusCode === 429) {
    throw new Error('Project creation rate limit reached for this machine. Try again later.')
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Project creation failed (HTTP ${response.statusCode}). Try again later.`)
  }

  return parseProvisionResponse(response.body)
}
