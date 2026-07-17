/**
 * API Routing Manifest Generator
 *
 * Fetches the published OpenAPI specification index (the same source as
 * `sanity openapi list|get`) and distills it into the routing manifest used
 * by `sanity api` to decide which host serves a request path and which API
 * version to default to.
 *
 * The manifest is generated - not hand-maintained - so the set of APIs
 * reachable through `sanity api` follows the published specs.
 *
 * Regenerate:        tsx scripts/generate-api-routes.ts
 * Verify freshness:  tsx scripts/generate-api-routes.ts --check
 */

/* eslint-disable no-console */
import {readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {OPENAPI_SPEC_INDEX_URL} from '../src/actions/api/constants.ts'
import {distillApiRoutes, type SpecSource} from '../src/actions/api/distillApiRoutes.ts'
import {type ApiRouteEntry, type OpenApiDocument} from '../src/actions/api/types.ts'

const OUTPUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'generated',
  'apiRoutes.ts',
)

const FETCH_TIMEOUT_MS = 30_000

interface SpecIndexEntry {
  slug: string
  title: string
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)})
  if (!response.ok) {
    throw new Error(`GET ${url} responded with HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function fetchSpecSources(): Promise<SpecSource[]> {
  const index = await fetchJson<{specs?: SpecIndexEntry[]}>(OPENAPI_SPEC_INDEX_URL)
  const specs = index.specs ?? []
  if (specs.length === 0) {
    throw new Error(`No OpenAPI specs found at ${OPENAPI_SPEC_INDEX_URL}`)
  }

  const sources: SpecSource[] = []
  for (const {slug, title} of specs) {
    console.log(`Fetching spec: ${slug}`)
    const document = await fetchJson<OpenApiDocument>(
      `${OPENAPI_SPEC_INDEX_URL}/${slug}?format=json`,
    )
    sources.push({document, slug, title})
  }
  return sources
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

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check')

  const sources = await fetchSpecSources()
  const routes = distillApiRoutes(sources)
  const rendered = renderManifest(routes)

  if (checkOnly) {
    let existing = ''
    try {
      existing = readFileSync(OUTPUT_PATH, 'utf8')
    } catch {
      // Missing file is stale by definition
    }
    if (existing === rendered) {
      console.log('API routing manifest is up to date.')
      return
    }
    console.error(
      `API routing manifest is stale. Run "pnpm generate:api-routes" and commit the result.`,
    )
    process.exitCode = 1
    return
  }

  writeFileSync(OUTPUT_PATH, rendered)
  console.log(`Wrote ${routes.length} route entries to ${OUTPUT_PATH}`)
}

try {
  await main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
