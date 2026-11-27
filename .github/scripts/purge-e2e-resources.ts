/* eslint-disable no-console */
import {appendFileSync} from 'node:fs'
import {setTimeout as sleep} from 'node:timers/promises'

/**
 * Purges leftover Sanity projects and datasets created by the e2e suite
 * (`packages/@sanity/cli-e2e`) in the shared CI account.
 *
 * Uses the same credentials as the e2e workflows (`SANITY_E2E_*`) and only ever deletes resources
 * that match the e2e naming patterns below, so nothing else in the account is touched. Runs as a
 * dry run unless `PURGE_DRY_RUN=false`.
 */

const API_HOST = 'https://api.sanity.io'
const PROJECTS_API_VERSION = 'v2025-09-22'
const DATASETS_API_VERSION = 'v2025-09-16'
const REQUEST_TAG = 'sanity.cli.e2e-purge'

const MAX_ATTEMPTS = 5
const MAX_BACKOFF_MS = 60_000
const REQUEST_TIMEOUT_MS = 30_000
const DELETE_PACING_MS = 250
const MAX_PAGES = 100
const MS_PER_HOUR = 60 * 60 * 1000

/**
 * Display names of projects created by e2e runs.
 *
 * - `CLI E2E sanity new <github run id> node <major>`: minted, claimed into the e2e organization
 *   and deleted again by `__tests__/new.test.ts` (`getProjectName()`).
 * - `E2E Test <random>`: created by the (currently skipped) `init --project-name` test in
 *   `__tests__/init/init.studio.shared.ts`; kept so projects from earlier runs are still found.
 */
const E2E_PROJECT_NAME_PATTERNS: readonly RegExp[] = [
  /^CLI E2E sanity new (?:\d+|local) node \d+$/,
  /^E2E Test [a-z0-9]{1,8}$/,
]

/**
 * Dataset names the e2e suite creates inside the shared fixture project. `init --dataset staging`
 * (`__tests__/init/init.studio.shared.ts`) creates it on first use and nothing deletes it. Every
 * other test uses the permanent `production` dataset.
 */
const E2E_DATASET_NAMES: ReadonlySet<string> = new Set(['staging'])

/** Datasets the e2e suite expects to exist permanently (`getE2EDataset()` is hardcoded to this). */
const PERMANENT_DATASET_NAMES: readonly string[] = ['production']

const STALE_PROJECT_NAME_RUN_ID = /^CLI E2E sanity new (\d+) node (\d+)$/

type Scope = 'both' | 'datasets' | 'projects'
type ResourceKind = 'dataset' | 'project'
type Outcome = 'deleted' | 'failed' | 'kept' | 'would-delete'

interface Config {
  dryRun: boolean
  fixtureDataset: string | undefined
  fixtureProjectId: string
  olderThanHours: number
  organizationId: string
  scope: Scope
  token: string
}

interface ProjectRecord {
  createdAt: string | undefined
  displayName: string
  id: string
  organizationId: string | null
}

interface DatasetRecord {
  createdAt: string | undefined
  name: string
}

interface Decision {
  delete: boolean
  reason: string
}

interface Result {
  ageHours: number | undefined
  createdAt: string | undefined
  id: string
  kind: ResourceKind
  label: string
  outcome: Outcome
  reason: string

  parent?: string
}

class ApiError extends Error {
  readonly code: string | undefined
  readonly status: number | undefined

  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable "${name}"`)
  return value
}

function parseBoolean(name: string, value: string | undefined): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} must be "true" or "false", received ${JSON.stringify(value)}`)
}

function parseScope(value: string | undefined): Scope {
  switch (value) {
    case 'both':
    case 'datasets':
    case 'projects': {
      return value
    }
    default: {
      throw new Error(
        `PURGE_SCOPE must be "both", "datasets" or "projects", received ${JSON.stringify(value)}`,
      )
    }
  }
}

function parseOlderThanHours(value: string | undefined): number {
  const hours = Number(value)
  if (!value?.trim() || !Number.isFinite(hours) || hours < 1) {
    throw new Error(
      `PURGE_OLDER_THAN_HOURS must be a number of at least 1, received ${JSON.stringify(value)}`,
    )
  }
  return hours
}

function readConfig(): Config {
  return {
    dryRun: parseBoolean('PURGE_DRY_RUN', process.env.PURGE_DRY_RUN),
    fixtureDataset: process.env.SANITY_E2E_DATASET?.trim() || undefined,
    // The fixture project is the keep-list for projects, so refuse to run without it.
    fixtureProjectId: readRequiredEnv('SANITY_E2E_PROJECT_ID'),
    olderThanHours: parseOlderThanHours(process.env.PURGE_OLDER_THAN_HOURS),
    organizationId: readRequiredEnv('SANITY_E2E_ORGANIZATION_ID'),
    scope: parseScope(process.env.PURGE_SCOPE),
    token: readRequiredEnv('SANITY_E2E_TOKEN'),
  }
}

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter)
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()
    if (Number.isFinite(delay)) return Math.min(Math.max(delay, 0), MAX_BACKOFF_MS)
  }
  return Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS)
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

/** Extracts the machine-readable error code and a message from an API error body. */
function describeErrorBody(body: unknown): {code?: string; message?: string} {
  if (!isRecord(body)) return {}
  const nested = isRecord(body.error) ? body.error : undefined
  const code = [nested?.type, nested?.code, body.code, body.type, body.error].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  const message = [nested?.description, nested?.message, body.message, body.description].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  return {code, message}
}

function redact(text: string, secrets: readonly string[]): string {
  let result = text
  for (const secret of secrets) {
    if (secret) result = result.replaceAll(secret, '[redacted]')
  }
  return result.replaceAll(/\s+/g, ' ').trim().slice(0, 300)
}

function createApiClient(token: string) {
  async function request(method: 'DELETE' | 'GET', path: string, query?: URLSearchParams) {
    const url = new URL(path, API_HOST)
    url.searchParams.set('tag', REQUEST_TAG)
    for (const [key, value] of query ?? []) url.searchParams.set(key, value)

    for (let attempt = 1; ; attempt++) {
      let retryAfter: string | null = null
      let failure: ApiError

      try {
        const response = await fetch(url, {
          headers: {Authorization: `Bearer ${token}`},
          method,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        const text = await response.text()
        let body: unknown
        try {
          body = text ? (JSON.parse(text) as unknown) : undefined
        } catch {
          body = undefined
        }

        if (response.ok) return body

        const {code, message} = describeErrorBody(body)
        failure = new ApiError(
          redact(
            `HTTP ${response.status}${code ? ` ${code}` : ''}${message ? `: ${message}` : ''}`,
            [token],
          ),
          response.status,
          code,
        )
        if (!isRetryableStatus(response.status)) throw failure
        retryAfter = response.headers.get('retry-after')
      } catch (error) {
        if (error instanceof ApiError) {
          if (!isRetryableStatus(error.status ?? 0)) throw error
          failure = error
        } else {
          failure = new ApiError(
            redact(`Request failed: ${error instanceof Error ? error.message : String(error)}`, [
              token,
            ]),
          )
        }
      }

      if (attempt >= MAX_ATTEMPTS) throw failure
      const delay = retryDelayMs(attempt, retryAfter)
      console.warn(
        `${method} ${url.pathname} failed (${failure.message}); retrying in ${delay}ms (attempt ${attempt}/${MAX_ATTEMPTS})`,
      )
      await sleep(delay)
    }
  }

  return {request}
}

type ApiClient = ReturnType<typeof createApiClient>

function toProjectRecord(value: unknown): ProjectRecord | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) return undefined
  return {
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
    displayName: typeof value.displayName === 'string' ? value.displayName : '',
    id: value.id,
    organizationId: typeof value.organizationId === 'string' ? value.organizationId : null,
  }
}

function toDatasetRecord(value: unknown): DatasetRecord | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || value.name.length === 0) {
    return undefined
  }
  return {
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
    name: value.name,
  }
}

/**
 * Lists the projects of the e2e organization. A plain array is a single page; if the API ever
 * returns an envelope with a `nextCursor`, it is followed until exhausted.
 */
async function listProjects(client: ApiClient, organizationId: string): Promise<ProjectRecord[]> {
  const projects: ProjectRecord[] = []
  let cursor: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({includeMembers: 'false', organizationId})
    if (cursor) query.set('cursor', cursor)

    const body = await client.request('GET', `/${PROJECTS_API_VERSION}/projects`, query)
    const items = Array.isArray(body) ? body : isRecord(body) ? body.data : undefined
    if (!Array.isArray(items)) throw new TypeError('Project list returned an unexpected response')

    for (const item of items) {
      const project = toProjectRecord(item)
      if (project) projects.push(project)
    }

    const next = isRecord(body) ? body.nextCursor : undefined
    if (typeof next !== 'string' || next.length === 0 || next === cursor) return projects
    cursor = next
  }

  throw new Error(`Project list did not finish within ${MAX_PAGES} pages`)
}

async function listDatasets(client: ApiClient, projectId: string): Promise<DatasetRecord[]> {
  const body = await client.request(
    'GET',
    `/${DATASETS_API_VERSION}/projects/${encodeURIComponent(projectId)}/datasets`,
  )
  if (!Array.isArray(body)) throw new TypeError('Dataset list returned an unexpected response')
  return body.flatMap((item) => toDatasetRecord(item) ?? [])
}

function ageInHours(createdAt: string | undefined, now: number): number | undefined {
  if (!createdAt) return undefined
  const created = Date.parse(createdAt)
  return Number.isNaN(created) ? undefined : (now - created) / MS_PER_HOUR
}

function formatAge(hours: number | undefined): string {
  if (hours === undefined) return 'unknown'
  if (hours < 48) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function isE2EProjectName(displayName: string): boolean {
  return E2E_PROJECT_NAME_PATTERNS.some((pattern) => pattern.test(displayName))
}

function decideProject(project: ProjectRecord, config: Config, ageHours: number | undefined) {
  if (project.id === config.fixtureProjectId) {
    return {delete: false, reason: 'Permanent e2e fixture project (SANITY_E2E_PROJECT_ID)'}
  }
  if (project.organizationId !== config.organizationId) {
    return {delete: false, reason: 'Not in the e2e organization'}
  }
  if (!isE2EProjectName(project.displayName)) {
    return {delete: false, reason: 'Name does not match an e2e project name'}
  }
  if (ageHours === undefined) return {delete: false, reason: 'Missing or invalid createdAt'}
  if (ageHours < config.olderThanHours) {
    return {delete: false, reason: `Newer than ${config.olderThanHours}h (may be in use)`}
  }
  return {delete: true, reason: `E2E project older than ${config.olderThanHours}h`}
}

function decideDataset(dataset: DatasetRecord, config: Config, ageHours: number | undefined) {
  const permanent = new Set(PERMANENT_DATASET_NAMES)
  if (config.fixtureDataset) permanent.add(config.fixtureDataset)

  if (permanent.has(dataset.name)) {
    return {delete: false, reason: 'Permanent e2e dataset'}
  }
  if (!E2E_DATASET_NAMES.has(dataset.name)) {
    return {delete: false, reason: 'Name does not match a dataset created by the e2e suite'}
  }
  if (ageHours === undefined) return {delete: false, reason: 'Missing or invalid createdAt'}
  if (ageHours < config.olderThanHours) {
    return {delete: false, reason: `Newer than ${config.olderThanHours}h (may be in use)`}
  }
  return {delete: true, reason: `E2E dataset older than ${config.olderThanHours}h`}
}

async function applyDecision(
  decision: Decision,
  base: Omit<Result, 'outcome' | 'reason'>,
  config: Config,
  performDelete: () => Promise<unknown>,
): Promise<Result> {
  if (!decision.delete) return {...base, outcome: 'kept', reason: decision.reason}
  if (config.dryRun) return {...base, outcome: 'would-delete', reason: decision.reason}

  try {
    await performDelete()
    await sleep(DELETE_PACING_MS)
    return {...base, outcome: 'deleted', reason: decision.reason}
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    // The resource is already gone, which is the outcome we wanted.
    if (error instanceof ApiError && error.status === 404) {
      return {...base, outcome: 'deleted', reason: 'Already deleted (404)'}
    }
    console.error(`Failed to delete ${base.kind} ${base.id}: ${reason}`)
    return {...base, outcome: 'failed', reason}
  }
}

async function purgeDatasets(client: ApiClient, config: Config, now: number): Promise<Result[]> {
  const datasets = await listDatasets(client, config.fixtureProjectId)
  console.log(`Found ${datasets.length} dataset(s) in fixture project ${config.fixtureProjectId}`)

  const results: Result[] = []
  for (const dataset of datasets) {
    const ageHours = ageInHours(dataset.createdAt, now)
    results.push(
      await applyDecision(
        decideDataset(dataset, config, ageHours),
        {
          ageHours,
          createdAt: dataset.createdAt,
          id: dataset.name,
          kind: 'dataset',
          label: dataset.name,
          parent: config.fixtureProjectId,
        },
        config,
        () =>
          client.request(
            'DELETE',
            `/${DATASETS_API_VERSION}/projects/${encodeURIComponent(config.fixtureProjectId)}/datasets/${encodeURIComponent(dataset.name)}`,
          ),
      ),
    )
  }
  return results
}

async function purgeProjects(client: ApiClient, config: Config, now: number): Promise<Result[]> {
  const projects = await listProjects(client, config.organizationId)
  console.log(`Found ${projects.length} project(s) in organization ${config.organizationId}`)

  const results: Result[] = []
  for (const project of projects) {
    const ageHours = ageInHours(project.createdAt, now)
    results.push(
      await applyDecision(
        decideProject(project, config, ageHours),
        {
          ageHours,
          createdAt: project.createdAt,
          id: project.id,
          kind: 'project',
          label: project.displayName,
        },
        config,
        () =>
          client.request(
            'DELETE',
            `/${PROJECTS_API_VERSION}/projects/${encodeURIComponent(project.id)}`,
          ),
      ),
    )
  }
  return results
}

/** Escapes text for a markdown table cell. */
function cell(value: string): string {
  return value.replaceAll(/[\r\n]+/g, ' ').replaceAll('|', String.raw`\|`)
}

/** Neutralizes backticks in API-provided text so it can't break out of inline code. */
function plain(value: string): string {
  return value.replaceAll('`', "'")
}

function table(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((value) => cell(value)).join(' | ')} |`),
  ].join('\n')
}

function resultRows(results: Result[]): string[][] {
  return results.map((result) => [
    result.kind,
    `\`${plain(result.id)}\``,
    result.kind === 'dataset' ? `project \`${plain(result.parent ?? '')}\`` : plain(result.label),
    result.createdAt ?? 'unknown',
    formatAge(result.ageHours),
    plain(result.reason),
  ])
}

const RESULT_HEADERS = ['Type', 'ID', 'Name', 'Created', 'Age', 'Reason']

function section(title: string, results: Result[], open: boolean): string {
  if (results.length === 0) return ''
  return [
    `<details${open ? ' open' : ''}><summary><b>${title} (${results.length})</b></summary>`,
    '',
    table(RESULT_HEADERS, resultRows(results)),
    '',
    '</details>',
    '',
  ].join('\n')
}

function countBy(results: Result[], kind: ResourceKind, outcomes: Outcome[]): number {
  return results.filter((r) => r.kind === kind && outcomes.includes(r.outcome)).length
}

function teardownReport(config: Config, results: Result[]): string {
  const lines = ['### E2E teardown leak report', '']

  if (config.scope === 'datasets') {
    lines.push('Projects were not inspected in this run (scope is `datasets`).')
    return lines.join('\n')
  }

  const stale = results.filter(
    (r) =>
      r.kind === 'project' &&
      (r.outcome === 'would-delete' || r.outcome === 'deleted' || r.outcome === 'failed'),
  )

  if (stale.length === 0) {
    lines.push(
      `No e2e projects older than ${config.olderThanHours}h were found, so teardown is not leaking projects right now.`,
    )
  } else {
    const ages = stale.flatMap((r) => (r.ageHours === undefined ? [] : [r.ageHours]))
    const nodeMajors = new Map<string, number>()
    const runIds = new Set<string>()
    for (const result of stale) {
      const match = STALE_PROJECT_NAME_RUN_ID.exec(result.label)
      if (!match) continue
      runIds.add(match[1])
      nodeMajors.set(match[2], (nodeMajors.get(match[2]) ?? 0) + 1)
    }
    lines.push(
      `**Teardown is leaking:** ${stale.length} e2e project(s) survived past ${config.olderThanHours}h` +
        (ages.length > 0
          ? ` (oldest ${formatAge(Math.max(...ages))}, newest ${formatAge(Math.min(...ages))})`
          : '') +
        `, from ${runIds.size} distinct workflow run(s).`,
    )
    if (nodeMajors.size > 0) {
      lines.push(
        '',
        `By Node major: ${[...nodeMajors].map(([major, count]) => `${major}: ${count}`).join(', ')}.`,
      )
    }
  }

  lines.push(
    '',
    'How teardown works and where it can leak (from reading `packages/@sanity/cli-e2e`):',
    '',
    '- Only `__tests__/new.test.ts` creates projects. It deletes its project in an `onTestFinished` hook, which does not run if the job is cancelled mid-test. `e2e-scheduled.yml` uses `cancel-in-progress: true` with one group for the whole workflow, so the next hourly run or a manual dispatch cancels an in-flight one.',
    '- The same hook deliberately skips deletion after a claim request times out (it cannot tell whether the claim is still running), and throws if deletion still fails after 3 attempts (for example on 429 or 5xx).',
    '- Datasets are never deleted: `init --dataset staging` creates `staging` in the fixture project on first use and nothing removes it. `globalSetup.ts` has no resource cleanup.',
    '- Projects minted by `sanity new` whose claim never succeeds stay unclaimed and are not in the e2e organization, so this workflow cannot see or delete them.',
  )

  return lines.join('\n')
}

function buildSummary(config: Config, results: Result[], startedAt: Date): string {
  const kinds: ResourceKind[] =
    config.scope === 'both'
      ? ['project', 'dataset']
      : config.scope === 'projects'
        ? ['project']
        : ['dataset']
  const cutoff = new Date(startedAt.getTime() - config.olderThanHours * MS_PER_HOUR)
  const deleteLabel = config.dryRun ? 'Would delete' : 'Deleted'
  const deleteOutcomes: Outcome[] = config.dryRun ? ['would-delete'] : ['deleted']

  const header = [
    `## E2E resource purge${config.dryRun ? ' (dry run)' : ''}`,
    '',
    config.dryRun
      ? '> **Dry run:** nothing was deleted. Re-run with `dry_run` unchecked to delete the resources listed below.'
      : '> **Live run:** resources listed under "Deleted" were removed.',
    '',
    `- Organization: \`${config.organizationId}\``,
    `- Fixture project (always kept): \`${config.fixtureProjectId}\``,
    `- Permanent datasets (always kept): ${[
      ...new Set([
        ...PERMANENT_DATASET_NAMES,
        ...(config.fixtureDataset ? [config.fixtureDataset] : []),
      ]),
    ]
      .map((name) => `\`${name}\``)
      .join(', ')}`,
    `- Scope: \`${config.scope}\``,
    `- Older than: ${config.olderThanHours}h (created before ${cutoff.toISOString()})`,
    '',
  ].join('\n')

  const totals = table(
    ['Resource', 'Found', 'Kept', deleteLabel, 'Failed'],
    kinds.map((kind) => [
      kind === 'project' ? 'Projects' : 'Datasets',
      String(results.filter((r) => r.kind === kind).length),
      String(countBy(results, kind, ['kept'])),
      String(countBy(results, kind, deleteOutcomes)),
      String(countBy(results, kind, ['failed'])),
    ]),
  )

  const byOutcome = (...outcomes: Outcome[]) => results.filter((r) => outcomes.includes(r.outcome))
  const kept = byOutcome('kept')
  const keptReasons = new Map<string, number>()
  for (const result of kept) {
    const key = `${result.kind}: ${result.reason}`
    keptReasons.set(key, (keptReasons.get(key) ?? 0) + 1)
  }
  const keptByReason =
    keptReasons.size > 0
      ? `\n\n${table(
          ['Kept because', 'Count'],
          [...keptReasons].map(([reason, count]) => [reason, String(count)]),
        )}`
      : ''

  return [
    header,
    totals,
    '',
    section('Failed', byOutcome('failed'), true),
    section(deleteLabel, byOutcome(...deleteOutcomes), true),
    `<details><summary><b>Kept (${kept.length})</b></summary>${keptByReason}\n\n${
      kept.length > 0 ? table(RESULT_HEADERS, resultRows(kept)) : ''
    }\n\n</details>\n`,
    teardownReport(config, results),
    '',
  ].join('\n')
}

function writeSummary(summary: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    appendFileSync(summaryPath, `${summary}\n`)
  } else {
    console.log(summary)
  }
}

async function main(): Promise<void> {
  const config = readConfig()
  const startedAt = new Date()
  const client = createApiClient(config.token)

  console.log(
    `Purging e2e resources (${config.dryRun ? 'dry run' : 'LIVE'}, scope: ${config.scope}, older than ${config.olderThanHours}h)`,
  )

  const results: Result[] = []
  const errors: string[] = []

  // Datasets first: they live in the permanent fixture project, which is never deleted.
  if (config.scope === 'both' || config.scope === 'datasets') {
    try {
      results.push(...(await purgeDatasets(client, config, startedAt.getTime())))
    } catch (error) {
      errors.push(`Listing datasets failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  if (config.scope === 'both' || config.scope === 'projects') {
    try {
      results.push(...(await purgeProjects(client, config, startedAt.getTime())))
    } catch (error) {
      errors.push(`Listing projects failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  const failed = results.filter((r) => r.outcome === 'failed')
  let summary = buildSummary(config, results, startedAt)
  if (errors.length > 0) {
    summary += `\n### Errors\n\n${errors.map((message) => `- ${cell(plain(message))}`).join('\n')}\n`
  }
  writeSummary(summary)

  for (const message of errors) console.error(message)
  console.log(
    `Done: ${results.filter((r) => r.outcome === 'kept').length} kept, ${
      results.filter((r) => r.outcome === 'deleted' || r.outcome === 'would-delete').length
    } ${config.dryRun ? 'would be deleted' : 'deleted'}, ${failed.length} failed`,
  )

  if (failed.length > 0 || errors.length > 0) process.exitCode = 1
}

await main()
