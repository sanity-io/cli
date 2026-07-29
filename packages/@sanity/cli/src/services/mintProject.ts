import {subdebug} from '@sanity/cli-core/debug'
import {createRequester} from '@sanity/cli-core/request'
import {isStaging} from '@sanity/cli-core/util'

const debug = subdebug('projects:mint')

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
    throw new Error(`Mint response is missing or invalid: ${missing.join(', ')}`)
  }

  return minted as MintedProject
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
      'Minting new projects is currently unavailable. Try again later, or run `sanity login` and `sanity init`.',
    )
  }
  if (response.statusCode === 429) {
    throw new Error('Mint rate limit reached for this machine. Try again later.')
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Mint failed (HTTP ${response.statusCode}). Try again later.`)
  }

  return parseProvisionResponse(response.body)
}
