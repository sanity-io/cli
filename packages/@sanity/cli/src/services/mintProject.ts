import {subdebug} from '@sanity/cli-core/debug'
import {isStaging} from '@sanity/cli-core/util'

const debug = subdebug('projects:mint')

/** Provision API version — see the unauthenticated mint-and-claim endpoint. */
export const PROVISION_API_VERSION = 'v2026-06-23'

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

/** Claim state of a minted resource, per the provision lookup endpoint. */
export type ClaimState = 'claimable' | 'claimed' | 'expired'

/**
 * Look up the claim state for a minted project. Unauthenticated and non-destructive — possession
 * of the claim token is the capability, and the endpoint is safe to poll.
 *
 * Returns `undefined` when the state can't be determined (network failure, timeout, kill switch
 * off) so callers can fail open and fall back to locally stored expiry data.
 */
export async function lookupClaimState(
  claimToken: string,
  options?: {timeoutMs?: number},
): Promise<{expiresAt: string | null; state: ClaimState} | undefined> {
  const url = `${getProvisionApiBase()}/${PROVISION_API_VERSION}/provision/${claimToken}/lookup`
  debug('looking up claim state at %s', url)

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(options?.timeoutMs ?? 1500),
    })
    if (!response.ok) return undefined

    const data = (await response.json()) as {expiresAt?: string | null; state?: ClaimState}
    if (data.state !== 'claimable' && data.state !== 'claimed' && data.state !== 'expired') {
      return undefined
    }
    return {expiresAt: data.expiresAt ?? null, state: data.state}
  } catch (err) {
    debug('claim state lookup failed: %s', err)
    return undefined
  }
}

/**
 * Claim-state check via the **project-scoped host** as the robot: an `organizationId` of
 * `oSystemUnclaimed` ⇔ still unclaimed. Authoritative anywhere the robot token exists and —
 * unlike the provision `lookup`, which draws from the 20/h provisioning budget — free to run on
 * every render. A 404 means the project is gone: reaped after expiry. A 401 only proves this
 * token was rejected — the project may be live with the token revoked or rotated — so it fails
 * open (`undefined`) rather than letting callers erase a possibly-claimable record; a truly
 * reaped project still resolves via the local clock and the provision lookup's swept-token
 * contract. Network failures also return `undefined`.
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
    const response = await fetch(url, {
      headers: {Authorization: `Bearer ${robotToken}`},
      signal: AbortSignal.timeout(options?.timeoutMs ?? 1500),
    })
    if (response.status === 404) return 'expired'
    if (response.status === 401) return undefined
    if (!response.ok) return undefined

    const data = (await response.json()) as {organizationId?: string}
    if (!data.organizationId) return undefined
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

  const response = await fetch(url, {
    body: JSON.stringify({displayName, resourceType: 'project'}),
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Mint failed (HTTP ${response.status}): ${body || response.statusText}`)
  }

  const data = (await response.json()) as ProvisionResponse

  // Mint may 404 (kill switch off) or 429 (rate limited) and return no claim token.
  if (!data?.claimToken) {
    throw new Error(
      'Mint did not return a claim token (provisioning disabled, or rate limited). ' +
        'See the provision API response.',
    )
  }

  // A 200 is still external input: every field below lands in .env or the JSON payload, so a
  // missing one must fail here by name — not crash on `data.links` or quietly write the
  // literal string "undefined" as a credential.
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
      `Mint response is missing ${missing.join(', ')} — see the provision API response.`,
    )
  }
  return minted as MintedProject
}
