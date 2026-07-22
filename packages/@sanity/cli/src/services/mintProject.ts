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
