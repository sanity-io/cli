import {describe, onTestFinished, test} from 'vitest'

import {readEnv} from '../helpers/readEnv.js'
import {getE2EOrganizationId, runCli} from '../helpers/runCli.js'

const isRegistryMode = process.env.E2E_REGISTRY_MODE === 'true'
const smokeTestTag = 'sanity.cli.smoketest'
const projectsApiBase = 'https://api.sanity.io/v2025-09-22/projects'
const requestAttempts = 3
const requestTimeout = 5000

interface ClaimableProject {
  claimApiUrl: string
  claimToken: string
  projectId: string
}

interface ApiOutcome {
  ok: boolean
  status: number

  diagnostic?: string
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`sanity new returned an invalid ${key}`)
  }
  return value
}

function requireHttpsUrl(record: Record<string, unknown>, key: string): string {
  const value = requireString(record, key)

  try {
    if (new URL(value).protocol === 'https:') return value
  } catch {
    // Report the field name without exposing the sensitive value.
  }

  throw new Error(`sanity new returned an invalid ${key}`)
}

function parseMintResponse(stdout: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(stdout)
  } catch {
    throw new Error('sanity new did not return valid JSON')
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('sanity new did not return a JSON object')
  }

  return value as Record<string, unknown>
}

function parseClaimableProject(record: Record<string, unknown>): ClaimableProject {
  return {
    claimApiUrl: requireHttpsUrl(record, 'claimApiUrl'),
    claimToken: requireString(record, 'claimToken'),
    projectId: requireString(record, 'projectId'),
  }
}

function validateMintResponse(record: Record<string, unknown>): void {
  requireHttpsUrl(record, 'claimUrl')
  requireString(record, 'dataset')
  requireString(record, 'expiresAt')
  requireString(record, 'token')
}

function taggedUrl(url: string): string {
  const tagged = new URL(url)
  tagged.searchParams.set('tag', smokeTestTag)
  return tagged.toString()
}

function projectUrl(projectId: string): string {
  return taggedUrl(`${projectsApiBase}/${encodeURIComponent(projectId)}`)
}

function authHeaders(token: string): Record<string, string> {
  return {Authorization: `Bearer ${token}`}
}

async function responseDiagnostic(
  response: Response,
  secrets: string[],
): Promise<string | undefined> {
  let value: unknown
  try {
    value = (await response.json()) as unknown
  } catch {
    return undefined
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const record = value as Record<string, unknown>
  const fields = [record.error, record.message].filter(
    (field): field is string => typeof field === 'string' && field.length > 0,
  )
  let diagnostic = [...new Set(fields)].join(': ').replaceAll(/\s+/gu, ' ').trim()
  if (!diagnostic) return undefined

  for (const secret of secrets) {
    if (secret) diagnostic = diagnostic.replaceAll(secret, '[redacted]')
  }

  return diagnostic.slice(0, 500)
}

function failureMessage(operation: string, status: number, diagnostic?: string): string {
  return `${operation} failed with HTTP ${status}${diagnostic ? `: ${diagnostic}` : ''}`
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function retryDelay(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter)
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()
    if (Number.isFinite(delay)) return Math.min(Math.max(delay, 0), 5000)
  }

  return 500 * attempt
}

async function fetchWithRetry(
  operation: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    let retryAfter: string | null = null
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(requestTimeout),
      })
      if (!isTransientStatus(response.status) || attempt === requestAttempts) return response
      retryAfter = response.headers.get('retry-after')
    } catch {
      if (attempt === requestAttempts) {
        throw new Error(`${operation} could not reach the API after ${requestAttempts} attempts`)
      }
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, retryAfter)))
  }

  throw new Error(`${operation} exhausted its retry attempts`)
}

async function claimProject(
  project: ClaimableProject,
  organizationId: string,
  token: string,
): Promise<ApiOutcome> {
  let response: Response
  try {
    response = await fetchWithRetry('Project claim', taggedUrl(project.claimApiUrl), {
      body: JSON.stringify({claimToken: project.claimToken, organizationId}),
      headers: {...authHeaders(token), 'Content-Type': 'application/json'},
      method: 'POST',
    })
  } catch (claimError) {
    try {
      const lookup = await getClaimedProject(project.projectId, token)
      if (await belongsToOrganization(lookup, organizationId)) return {ok: true, status: 200}
    } catch {
      // Preserve the claim failure when the reconciliation lookup is also unavailable.
    }
    throw claimError
  }

  if (response.ok) return {ok: true, status: response.status}

  const diagnostic = await responseDiagnostic(response, [project.claimToken, token])

  const lookup = await getClaimedProject(project.projectId, token)
  if (await belongsToOrganization(lookup, organizationId))
    return {ok: true, status: response.status}

  return {diagnostic, ok: false, status: response.status}
}

async function getProject(projectId: string, token: string): Promise<Response> {
  return fetchWithRetry('Project lookup', projectUrl(projectId), {headers: authHeaders(token)})
}

async function getClaimedProject(projectId: string, token: string): Promise<Response> {
  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    const response = await getProject(projectId, token)
    if (![403, 404].includes(response.status) || attempt === requestAttempts) return response

    await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
  }

  throw new Error('Claimed project lookup exhausted its retry attempts')
}

async function belongsToOrganization(response: Response, organizationId: string): Promise<boolean> {
  if (!response.ok) return false

  try {
    const value = (await response.json()) as unknown
    return (
      Boolean(value) &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).organizationId === organizationId
    )
  } catch {
    return false
  }
}

async function deleteProject(projectId: string, token: string): Promise<void> {
  const response = await fetchWithRetry('Project deletion', projectUrl(projectId), {
    headers: authHeaders(token),
    method: 'DELETE',
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(
      failureMessage(
        'Project cleanup',
        response.status,
        await responseDiagnostic(response, [token]),
      ),
    )
  }

  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    const lookup = await getProject(projectId, token)
    if (lookup.status === 404) return
    if (lookup.status !== 200 || attempt === requestAttempts) {
      throw new Error(
        failureMessage(
          'Deleted project verification',
          lookup.status,
          await responseDiagnostic(lookup, [token]),
        ),
      )
    }

    await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
  }
}

function getProjectName(): string {
  const runId = process.env.GITHUB_RUN_ID ?? 'local'
  const nodeMajor = process.versions.node.split('.')[0]
  return `CLI E2E sanity new ${runId} node ${nodeMajor}`
}

describe.skipIf(!isRegistryMode)('sanity new lifecycle', {timeout: 90_000}, () => {
  test('mints, claims, and deletes a project', async () => {
    const organizationId = getE2EOrganizationId()
    const e2eToken = readEnv('SANITY_E2E_TOKEN')
    const displayName = getProjectName()

    const result = await runCli({
      args: ['new', displayName, '--json'],
      env: {SANITY_AUTH_TOKEN: '', SANITY_CLI_MINT_TAG: smokeTestTag},
    })
    if (result.error) throw result.error
    const mintResponse = parseMintResponse(result.stdout)
    const project = parseClaimableProject(mintResponse)
    let claimed = false

    onTestFinished(async () => {
      if (!claimed) {
        const lookup = await getProject(project.projectId, e2eToken)
        claimed = await belongsToOrganization(lookup, organizationId)

        if (!claimed) {
          const claimResponse = await claimProject(project, organizationId, e2eToken)
          if (!claimResponse.ok) {
            throw new Error(
              failureMessage(
                'Project cleanup claim',
                claimResponse.status,
                claimResponse.diagnostic,
              ),
            )
          }

          const claimedProject = await getClaimedProject(project.projectId, e2eToken)
          if (!(await belongsToOrganization(claimedProject, organizationId))) {
            throw new Error('Project cleanup could not verify the e2e organization claim')
          }
        }
      }

      await deleteProject(project.projectId, e2eToken)
    })

    validateMintResponse(mintResponse)

    const claimResponse = await claimProject(project, organizationId, e2eToken)
    if (!claimResponse.ok) {
      throw new Error(
        failureMessage('Project claim', claimResponse.status, claimResponse.diagnostic),
      )
    }

    const projectResponse = await getClaimedProject(project.projectId, e2eToken)
    if (!projectResponse.ok) {
      throw new Error(
        failureMessage(
          'Claimed project lookup',
          projectResponse.status,
          await responseDiagnostic(projectResponse, [e2eToken]),
        ),
      )
    }

    const claimedProject = (await projectResponse.json()) as unknown
    if (!claimedProject || typeof claimedProject !== 'object' || Array.isArray(claimedProject)) {
      throw new Error('Claimed project lookup returned an invalid response')
    }

    const record = claimedProject as Record<string, unknown>
    if (record.organizationId !== organizationId) {
      throw new Error('Claimed project was not attached to the e2e organization')
    }
    claimed = true
    if (record.displayName !== displayName) {
      throw new Error('Claimed project did not retain its deterministic display name')
    }
  })
})
