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

/**
 * Request tag identifying the caller to the provisioning funnel, using the same `?tag=` convention
 * as every other Sanity API request. `sanity new` is deliberately usable without an account, so
 * most mints have no user to attribute — this is what tells reporting who made them, and is how
 * synthetic callers are kept out of mint-to-claim conversion.
 */
export const MINT_REQUEST_TAG = 'sanity.cli'

/**
 * Overrides {@link MINT_REQUEST_TAG}. Internal plumbing for the scheduled smoke test, which mints
 * against production several times an hour and never claims; it sets `sanity.cli.smoketest` so
 * those mints can be excluded from reporting.
 */
const MINT_TAG_ENV_VAR = 'SANITY_CLI_MINT_TAG'

/** Mirrors `@sanity/client`'s `requestTag` rule, which is what the API accepts. */
const TAG_PATTERN = /^[a-z0-9._-]{1,75}$/i

function getRequestTag(): string {
  const override = process.env[MINT_TAG_ENV_VAR]
  if (!override) return MINT_REQUEST_TAG
  if (!TAG_PATTERN.test(override)) {
    // A malformed override would be dropped by the API anyway; fall back rather than mint
    // untagged, so the request is still attributable.
    debug('ignoring malformed %s value %j', MINT_TAG_ENV_VAR, override)
    return MINT_REQUEST_TAG
  }
  return override
}

const request = createRequester({httpErrors: false})

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

  const url = new URL(`${PROVISION_API_VERSION}/provision`, getProvisionApiBase())
  url.searchParams.set('tag', getRequestTag())
  debug('minting unclaimed project at %s', url.toString())

  const response = await request({
    body: JSON.stringify({displayName, resourceType: 'project'}),
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
    url: url.toString(),
  })

  if (response.status === 404) {
    throw new Error(
      'Creating projects without an account is currently unavailable. Try again later, or run `sanity login` and `sanity init`.',
    )
  }
  if (response.status === 429) {
    throw new Error('Project creation rate limit reached for this machine. Try again later.')
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Project creation failed (HTTP ${response.status}). Try again later.`)
  }

  return parseProvisionResponse(response.text())
}
