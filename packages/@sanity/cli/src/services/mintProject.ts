import {subdebug} from '@sanity/cli-core/debug'
import {createRequester} from '@sanity/cli-core/request'
import {isStaging} from '@sanity/cli-core/util'

const debug = subdebug('projects:mint')

/** Provision API version — see the unauthenticated mint-and-claim endpoint. */
export const PROVISION_API_VERSION = 'v2026-06-23'

export {CLAIM_WINDOW_HOURS} from '../util/mintProjectConstants.js'

// The claim-state lookups branch on status codes (404/401 are meaningful answers, not failures),
// so non-2xx responses must be returned rather than thrown.
const request = createRequester({middleware: {httpErrors: false, promise: {onlyBody: false}}})

const isOk = (statusCode: number) => statusCode >= 200 && statusCode < 300

function parseJsonBody(body: unknown): unknown {
  if (typeof body !== 'string') return body
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

export interface MintedProject {
  /** Project-scoped API host, e.g. `<id>.api.sanity.io`. */
  apiHost: string
  /** API endpoint that performs the claim. */
  claimApiUrl: string
  /** Token that authorizes claiming ownership of the project. */
  claimToken: string
  /** URL the user opens in a browser to claim the project. */
  claimUrl: string
  datasetName: string
  /** ISO timestamp after which the unclaimed project is reclaimed. */
  expiresAt: string
  /** The provisioned (unclaimed) project id. */
  resourceId: string
  /** Robot token scoped to the freshly minted, unclaimed project. */
  token: string
}

interface ProvisionResponse {
  apiHost: string
  claimToken: string
  datasetName: string
  expiresAt: string
  links: {claimApiUrl: string; claimUrl: string}
  resourceId: string
  resourceType: string
  token: string
}

function getProvisionApiBase(): string {
  const override = process.env.SANITY_API_HOST
  if (override) return override.replace(/\/$/, '')
  return isStaging() ? 'https://api.sanity.work' : 'https://api.sanity.io'
}

/** Claim state of a minted resource. `revoked` means the robot token itself was rejected. */
export type ClaimState = 'claimable' | 'claimed' | 'expired' | 'revoked'

/**
 * Look up claim state via the provision endpoint (rate-limited: ~20/h per IP). Unauthenticated
 * and safe to poll, but reserved for one-time checks like the pre-mint guard. Returns `undefined`
 * on uncertainty; callers must not use local expiry data to authorize replacement or cleanup.
 */
export async function lookupClaimState(
  claimToken: string,
  options?: {timeoutMs?: number},
): Promise<{expiresAt: string | null; state: ClaimState} | undefined> {
  const url = `${getProvisionApiBase()}/${PROVISION_API_VERSION}/provision/${claimToken}/lookup`
  debug('looking up claim state at %s', url)

  try {
    const response = await request({timeout: options?.timeoutMs ?? 500, url})
    if (!isOk(response.statusCode)) return undefined

    const data = parseJsonBody(response.body) as
      | {expiresAt?: string | null; state?: ClaimState}
      | undefined
    if (data?.state !== 'claimable' && data?.state !== 'claimed' && data?.state !== 'expired') {
      return undefined
    }
    return {expiresAt: data.expiresAt ?? null, state: data.state}
  } catch (err) {
    debug('claim state lookup failed: %s', err)
    return undefined
  }
}

/**
 * Polls for `oSystemUnclaimed` organizational membership to determine project claim status.
 * This keeps claim state checks fast and cheap (provisioning APIs are rate-limited).
 */
export async function lookupClaimStateViaProject(
  projectId: string,
  robotToken: string,
  options?: {timeoutMs?: number},
): Promise<ClaimState | undefined> {
  const override = process.env.SANITY_API_HOST
  const base = override
    ? override.replace(/\/$/, '')
    : `https://${projectId}.api.sanity.${isStaging() ? 'work' : 'io'}`
  const url = `${base}/v2026-05-04/projects/${projectId}`
  debug('checking claim state via project host at %s', url)

  try {
    const response = await request({
      headers: {Authorization: `Bearer ${robotToken}`},
      timeout: options?.timeoutMs ?? 500,
      url,
    })
    if (response.statusCode === 404) return 'expired'
    // 401 is a definitive rejection of the robot token (not a fail-open network error): report it
    // so the caller can drop the dead ledger entry, which otherwise keeps outranking a login session.
    if (response.statusCode === 401) return 'revoked'
    if (!isOk(response.statusCode)) return undefined

    const data = parseJsonBody(response.body) as {organizationId?: string} | undefined
    if (!data?.organizationId) return undefined
    return data.organizationId === 'oSystemUnclaimed' ? 'claimable' : 'claimed'
  } catch (err) {
    debug('project claim-state check failed: %s', err)
    return undefined
  }
}

/**
 * Mint an unclaimed Sanity project via the unauthenticated provision endpoint, returning a
 * scoped robot token and a claim URL:
 * `POST <apiHost>/<version>/provision` with `{resourceType:'project', displayName}`.
 */
export async function mintUnclaimedProject(options: {displayName: string}): Promise<MintedProject> {
  const displayName = options.displayName.trim()
  if (!displayName || displayName.length > 80) {
    throw new Error('Display name must be 1-80 characters.')
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
      'Minting new projects is currently disabled. Try again later, or run `sanity login` and `sanity init` to create a project.',
    )
  }
  if (response.statusCode === 429) {
    throw new Error('Mint rate limit reached for this machine. Try again later.')
  }
  if (!isOk(response.statusCode)) {
    const body = typeof response.body === 'string' ? response.body : ''
    throw new Error(`Mint failed (HTTP ${response.statusCode}): ${body || response.statusMessage}`)
  }

  const data = parseJsonBody(response.body) as ProvisionResponse | undefined

  if (!data?.claimToken) {
    throw new Error('Mint response did not include a claim token; see the provision API response.')
  }

  const minted = {
    apiHost: data.apiHost,
    claimApiUrl: data.links?.claimApiUrl,
    claimToken: data.claimToken,
    claimUrl: data.links?.claimUrl,
    datasetName: data.datasetName,
    expiresAt: data.expiresAt,
    resourceId: data.resourceId,
    token: data.token,
  }
  const missing = Object.entries(minted)
    .filter(([, value]) => typeof value !== 'string' || value === '')
    .map(([key]) => key)
  if (missing.length > 0) {
    throw new Error(
      `Mint response is missing ${missing.join(', ')}; see the provision API response.`,
    )
  }
  return minted as MintedProject
}
