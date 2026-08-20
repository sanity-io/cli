import {getCliToken} from '@sanity/cli-core/config'
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
 * as every other Sanity API request. `sanity new` is deliberately usable without an account, so a
 * mint often has no user to attribute — the tag names the tool instead, and is how synthetic
 * callers are kept out of mint-to-claim conversion.
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
 *
 * Works logged out. Credentials, when there are any, are sent only so the mint can be attributed
 * and are dropped on rejection, so being logged in changes reporting and nothing else.
 */
export async function mintUnclaimedProject(options: {displayName: string}): Promise<MintedProject> {
  const displayName = options.displayName.trim()
  if (!displayName || displayName.length > 80) {
    throw new Error('Project name must be 1-80 characters.')
  }

  const url = new URL(`${PROVISION_API_VERSION}/provision`, getProvisionApiBase())
  url.searchParams.set('tag', getRequestTag())
  debug('minting unclaimed project at %s', url.toString())

  const mint = (token?: string) =>
    request({
      body: JSON.stringify({displayName, resourceType: 'project'}),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
      method: 'POST',
      url: url.toString(),
    })

  // Minting needs no account, but attributing it to a person does. When the user is already
  // logged in, send the credentials so reporting can tell their mints from an unknown caller.
  const token = await getCliToken()
  let response = await mint(token)

  // The endpoint verifies a bearer token before the mint handler ever runs, so an expired login
  // would fail a command that does not require logging in at all in this case drop the credentials
  // and mint the project anonymously instead.
  if (token && (response.status === 401 || response.status === 403)) {
    debug('stored credentials rejected (HTTP %d), minting anonymously', response.status)
    response = await mint()
  }

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
