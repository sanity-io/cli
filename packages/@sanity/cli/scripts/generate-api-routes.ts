/**
 * API Routing Manifest Generator
 *
 * Fetches the published OpenAPI specification index (the same source as
 * `sanity openapi list|get`) and distills it into the routing manifest used
 * by `sanity api` to decide which host serves a request path and which API
 * version to default to.
 *
 * The manifest is generated - not hand-maintained - so the set of APIs
 * reachable through `sanity api` follows the published specs. It runs on
 * every build (prebuild hook) and fails the build when the specs can't be
 * fetched or the distilled manifest would be empty, so a release can never
 * ship with a missing or empty endpoint list.
 *
 * Regenerate:        tsx scripts/generate-api-routes.ts
 * Verify freshness:  tsx scripts/generate-api-routes.ts --check
 */

/* eslint-disable no-console */
import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {setTimeout as sleep} from 'node:timers/promises'
import {parseArgs} from 'node:util'

import pMap from 'p-map'

import {OPENAPI_SPEC_INDEX_URL} from '../src/actions/api/constants.ts'
import {distillApiRoutes, type SpecSource} from '../src/actions/api/distillApiRoutes.ts'
import {type ApiRouteEntry, type OpenApiDocument} from '../src/actions/api/types.ts'

const OUTPUT_PATH = join(import.meta.dirname, '..', 'src', 'generated', 'apiRoutes.ts')

const FETCH_TIMEOUT_MS = 30_000
const FETCH_ATTEMPTS = 3
const FETCH_CONCURRENCY = 6

interface SpecIndexEntry {
  slug: string
  title: string
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)})
      if (!response.ok) {
        throw new Error(`GET ${url} responded with HTTP ${response.status}`)
      }
      return (await response.json()) as T
    } catch (error) {
      lastError = error
      if (attempt < FETCH_ATTEMPTS) {
        const delayMs = 1000 * 2 ** (attempt - 1)
        console.warn(
          `Fetch failed (attempt ${attempt}/${FETCH_ATTEMPTS}), retrying in ${delayMs}ms: ${url}`,
        )
        await sleep(delayMs)
      }
    }
  }
  throw lastError
}

async function fetchSpecSources(): Promise<SpecSource[]> {
  const index = await fetchJson<{specs?: SpecIndexEntry[]}>(OPENAPI_SPEC_INDEX_URL)
  const specs = index.specs ?? []
  if (specs.length === 0) {
    throw new Error(`No OpenAPI specs found at ${OPENAPI_SPEC_INDEX_URL}`)
  }

  return pMap(
    specs,
    async ({slug, title}): Promise<SpecSource> => {
      console.log(`Fetching spec: ${slug}`)
      const document = await fetchJson<OpenApiDocument>(
        `${OPENAPI_SPEC_INDEX_URL}/${slug}?format=json`,
      )
      return {document, slug, title}
    },
    {concurrency: FETCH_CONCURRENCY},
  )
}

function renderManifest(routes: ApiRouteEntry[]): string {
  const serialized = JSON.stringify(routes, null, 2)
    // Match the repo code style (oxfmt): single-quoted strings.
    .replaceAll(/"((?:[^"\\]|\\.)*)":/g, (_, key: string) => `${key}:`)
    .replaceAll(
      /"((?:[^"\\]|\\.)*)"/g,
      (_, value: string) => `'${value.replaceAll("'", String.raw`\'`)}'`,
    )

  return `/**
 * GENERATED FILE - DO NOT EDIT
 *
 * Routing manifest for \`sanity api\`, distilled from the published OpenAPI
 * specifications at ${OPENAPI_SPEC_INDEX_URL}
 *
 * Regenerate with: pnpm generate:api-routes
 */
import {type ApiRouteEntry} from '../actions/api/types.js'

export const apiRoutes: ApiRouteEntry[] = ${serialized}
`
}

const {values: args} = parseArgs({options: {check: {default: false, type: 'boolean'}}})

const sources = await fetchSpecSources()
const routes = distillApiRoutes(sources)
if (routes.length === 0) {
  throw new Error(
    `Distilled API routing manifest is empty (${sources.length} specs fetched) - refusing to write an empty endpoint list`,
  )
}
const rendered = renderManifest(routes)

if (args.check) {
  let existing = ''
  try {
    existing = readFileSync(OUTPUT_PATH, 'utf8')
  } catch {
    // Missing file is stale by definition
  }
  if (existing === rendered) {
    console.log('API routing manifest is up to date.')
  } else {
    console.error(
      `API routing manifest is stale. Run "pnpm generate:api-routes" and commit the result.`,
    )
    process.exitCode = 1
  }
} else {
  writeFileSync(OUTPUT_PATH, rendered)
  console.log(`Wrote ${routes.length} route entries to ${OUTPUT_PATH}`)
}
