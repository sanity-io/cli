import {subdebug} from '@sanity/cli-core'
import {validate} from '@scalar/openapi-parser'
import {type OpenAPIV3, type OpenAPIV3_1} from '@scalar/openapi-types'

import {fetchSpec, fetchSpecIndex, type OpenApiSpecIndexEntry} from './docsClient.js'
import {
  extractParameters,
  extractRequestBody,
  extractResponses,
  extractSecurity,
  isStreamingResponse,
} from './extractors.js'

const debug = subdebug('api:parser')

/* ---------------------------------------------------------------------- *
 *  Capability classification                                              *
 * ---------------------------------------------------------------------- */

/**
 * Method-based capability classification used to tag operations in
 * `list` output: `[write]` / `[destructive]` / unmarked (read).
 *
 * `GET`/`HEAD`/`OPTIONS` → `read` (untagged).
 * `PATCH`/`PUT`/`DELETE` → `destructive`.
 * `POST` (and any other method, including `TRACE`/`CONNECT`) → `write`.
 *
 * Method-only by design — no path-name inspection. Keeps the rule
 * auditable and avoids false positives from path naming.
 */
type Capability = 'destructive' | 'read' | 'write'

export function classifyCapability(method: string): Capability {
  const upper = method.toUpperCase()
  if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') return 'read'
  if (upper === 'PATCH' || upper === 'PUT' || upper === 'DELETE') return 'destructive'
  return 'write'
}

/* ---------------------------------------------------------------------- *
 *  Parsed spec types                                                      *
 * ---------------------------------------------------------------------- */

/** A request parameter (path / query / header) with full schema metadata. */
export interface ParsedParam {
  description: string
  in: 'header' | 'path' | 'query'
  name: string
  required: boolean
  type: string

  default?: unknown
  enum?: (number | string)[]
  example?: unknown
  /** When the param's schema is a `$ref`, the referenced schema name. */
  ref?: string
}

/**
 * One field of a request body schema. Refs are **linked**, not
 * expanded: when a field's schema is `$ref: '#/components/schemas/Foo'`,
 * `ref` carries `'Foo'` and `fields` stays empty. Agents resolve refs
 * via `sanity api spec <slug> --schema <name>`.
 */
export interface ParsedBodyField {
  description: string
  fields: ParsedBodyField[]
  name: string
  required: boolean
  type: string

  default?: unknown
  enum?: (number | string)[]
  ref?: string
}

export interface ParsedRequestBody {
  contentType: string
  /** Top-level object fields (empty for refs / non-JSON / opaque). */
  fields: ParsedBodyField[]
  /** Referenced schemas appearing at the body root. */
  refs: string[]
  required: boolean
  /** One-line summary — schema name for refs, `{a, b, c}` for inline, `<contentType>` for opaque. */
  schemaSummary: string
}

export interface ParsedResponse {
  contentType: string
  schemaSummary: string
  /** HTTP status code as a number, or `0` for `default`. */
  status: number

  /** When the response schema is a `$ref`, the referenced schema name. */
  ref?: string
}

export interface SecurityScheme {
  /** Normalized scheme name, e.g. `BearerAuth`. */
  scheme: string
}

/** One parsed operation, denormalized for the CLI's operations index. */
export interface ParsedOperation {
  capability: Capability
  description: string
  /** `<api-version>/<path>` with `:name` placeholders (URL Pattern API style). */
  endpoint: string
  headerParams: ParsedParam[]
  isStreaming: boolean
  /** Uppercase HTTP method: `GET`, `POST`, … */
  method: string
  operationId: string
  optionalQueryParams: string[]
  /** Native OpenAPI path with `{name}` placeholders. */
  path: string
  pathParams: ParsedParam[]
  queryParams: ParsedParam[]
  requestBody: ParsedRequestBody | null
  responses: ParsedResponse[]
  security: SecurityScheme[]
  summary: string
}

/** Header info + operations for one OpenAPI spec. */
export interface ParsedSpec {
  description: string
  operations: ParsedOperation[]
  /**
   * `components.schemas` keyed by name. Empty when the spec doesn't
   * declare any. Used by `sanity api spec --schema <name>` to follow
   * `$ref` pointers without re-parsing the YAML.
   */
  schemas: Record<string, unknown>
  slug: string
  title: string
  /** `info.version` (may be a meaningless semver — the endpoint version comes from the server URL). */
  version: string
}

/** Flat operations index — one row per (spec, operation). */
export type OperationIndexEntry = ParsedOperation & {spec: string}

/* ---------------------------------------------------------------------- *
 *  URL Pattern helpers                                                    *
 * ---------------------------------------------------------------------- */

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

type HttpMethod = (typeof HTTP_METHODS)[number]

/**
 * Server variables we treat as runtime context: a future
 * request-execution layer fills them at call time, so we keep them
 * as `:name` placeholders in the endpoint string rather than
 * substituting build-time defaults.
 */
const CONTEXT_SERVER_VARS = new Set(['dataset', 'organizationId', 'projectId'])

/** Convert `{name}` placeholders in a URL/path to `:name` (URL Pattern API). */
export function toUrlPatternForm(value: string): string {
  return value.replaceAll(/\{([^}]+)\}/g, ':$1')
}

/**
 * Build a deterministic operationId for operations that don't declare
 * one in the spec. Lowercases the method, strips placeholder braces,
 * collapses non-alphanumeric runs to a single `_`. Examples:
 *
 *   `POST /data/mutate/<dataset>` → `post_data_mutate_dataset`
 *   `GET  /v1/users`              → `get_v1_users`
 */
function synthesizeOperationId(method: string, path: string): string {
  const normalized = path
    .replaceAll(/[{}]/g, '')
    .replaceAll(/[^a-zA-Z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
  return `${method.toLowerCase()}_${normalized}`
}

/* ---------------------------------------------------------------------- *
 *  Server URL helpers                                                     *
 * ---------------------------------------------------------------------- */

/**
 * Substitute server-variable defaults into a server URL template.
 *
 * `preserveContext: true` leaves `{projectId}` / `{dataset}` /
 * `{organizationId}` alone so they survive into the URL-Pattern form
 * as `:name` placeholders — displayed verbatim in `list` output.
 */
function substituteServerVars(
  rawUrl: string,
  vars: Record<string, OpenAPIV3.ServerVariableObject> | undefined,
  options: {preserveContext: boolean},
): string {
  if (!vars) return rawUrl
  let url = rawUrl
  for (const [name, variable] of Object.entries(vars)) {
    if (options.preserveContext && CONTEXT_SERVER_VARS.has(name)) continue
    if (variable?.default !== undefined) {
      url = url.replaceAll(`{${name}}`, String(variable.default))
    }
  }
  return url
}

/**
 * Extract the pathname segment from a server URL template that may still
 * contain `{projectId}`-style placeholders.
 *
 * We can't use `new URL()` because `{` is not a legal host character —
 * `https://{projectId}.api.sanity.io/…` throws. Instead, strip the
 * `scheme://host` prefix manually via regex.
 */
function extractServerPathSegment(serverUrlWithPlaceholders: string): string {
  if (!serverUrlWithPlaceholders) return ''
  const match = serverUrlWithPlaceholders.match(/^[a-z]+:\/\/[^/]+(\/.*)?$/i)
  if (!match) return ''
  const pathname = match[1] || ''
  return pathname.replaceAll(/^\/+|\/+$/g, '')
}

/* ---------------------------------------------------------------------- *
 *  OpenAPI parser                                                         *
 * ---------------------------------------------------------------------- */

type OperationObject = OpenAPIV3.OperationObject | OpenAPIV3_1.OperationObject
type PathItemObject = OpenAPIV3.PathItemObject | OpenAPIV3_1.PathItemObject

/**
 * Parse an OpenAPI spec (YAML or JSON string) into a `ParsedSpec`
 * (header info + flat operations list). Validation goes through
 * `@scalar/openapi-parser`, which leaves `$ref`s in place
 * (link-not-resolve for schemas; parameter refs are resolved inline).
 *
 * Strict validation warnings (missing descriptions, unbound path params,
 * etc.) are not fatal — surfaces whatever it can read. Only hard parse
 * failures (`specification` missing entirely) throw.
 *
 * Operations without an `operationId` get a deterministic synthesized
 * id from method + path (see `synthesizeOperationId`); the synthesis
 * is debug-logged.
 */
export async function parseOpenApi(slug: string, yaml: string): Promise<ParsedSpec> {
  const result = await validate(yaml)
  if (!result.specification) {
    const messages = result.errors?.map((e) => e.message).join('; ') ?? 'unknown error'
    throw new Error(`Spec "${slug}" failed to parse: ${messages}`)
  }
  if (result.version && result.version !== '3.0' && result.version !== '3.1') {
    debug(`spec "${slug}" uses OpenAPI ${result.version} — proceeding with best-effort parse`)
  }
  const doc = result.specification as OpenAPIV3_1.Document

  const serverObj = doc.servers?.[0]
  const serverUrlRaw = serverObj?.url || ''
  const serverVars = serverObj?.variables as
    | Record<string, OpenAPIV3.ServerVariableObject>
    | undefined

  // The version path-segment lives in the resolved server URL's pathname
  // — NOT `info.version` (which can be a meaningless semver like `1.0.0`
  // for specs whose API version is declared in server variables, or
  // baked literally into the OpenAPI `paths` keys). Context vars
  // (`{projectId}`, `{dataset}`, `{organizationId}`) are preserved so
  // they survive as `:name` placeholders in the final URL-Pattern form.
  const serverUrlWithContextVars = substituteServerVars(serverUrlRaw, serverVars, {
    preserveContext: true,
  })
  const serverPathSegment = extractServerPathSegment(serverUrlWithContextVars)

  const operations: ParsedOperation[] = []
  for (const [rawPath, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem) continue
    const pathItemObj = pathItem as PathItemObject

    for (const method of HTTP_METHODS) {
      const op = pathItemObj[method as HttpMethod] as OperationObject | undefined
      if (!op) continue

      const methodUpper = method.toUpperCase()
      // Some specs we don't control omit `operationId` (e.g. the `mutation`
      // spec's POST). Synthesize a deterministic id from method + path so
      // every row stays uniquely addressable for agents indexing by
      // operationId. Real ids win when present.
      const operationId = op.operationId ?? synthesizeOperationId(method, rawPath)
      if (!op.operationId) {
        debug(`synthesized operationId "${operationId}" for ${methodUpper} ${rawPath}`)
      }

      const {headerParams, pathParams, queryParams} = extractParameters(
        pathItemObj.parameters,
        op.parameters,
        doc,
      )
      const responses = extractResponses(op)
      const opPath = rawPath.replace(/^\/+/, '')
      const combined = serverPathSegment ? `${serverPathSegment}/${opPath}` : opPath

      operations.push({
        capability: classifyCapability(methodUpper),
        description: op.description ?? '',
        endpoint: toUrlPatternForm(combined),
        headerParams,
        isStreaming: isStreamingResponse(responses),
        method: methodUpper,
        operationId,
        optionalQueryParams,
        path: rawPath,
        pathParams,
        queryParams,
        requestBody: extractRequestBody(op, {operationId, specSlug: slug}),
        responses,
        security: extractSecurity(op, doc),
        summary: op.summary ?? '',
      })
    }
  }

  return {
    description: doc.info?.description ?? '',
    operations,
    schemas: (doc.components?.schemas as Record<string, unknown> | undefined) ?? {},
    slug,
    title: doc.info?.title || slug,
    version: doc.info?.version ?? '',
  }
}

/* ---------------------------------------------------------------------- *
 *  Loaders                                                                *
 * ---------------------------------------------------------------------- */

/**
 * Fetch the docs index and every per-spec body, parse each, and return
 * the flat operations index — sorted by spec → path → method.
 *
 * Single seam for the discovery pipeline. Callers don't need to wire
 * the index fetch + fan-out + flatten + sort steps themselves.
 *
 * `onlySlug` short-circuits the fan-out: when set, the index is
 * filtered before any per-spec fetches happen, so
 * `sanity api list --spec=jobs` makes one index request + one spec
 * request instead of one + 22.
 *
 * Error semantics:
 *   - The index fetch throws on network/non-2xx — callers translate
 *     that into a user-facing message.
 *   - Per-spec 404s are skipped silently.
 *   - Per-spec parse errors are debug-logged and skipped without
 *     breaking the run.
 *
 * Specs are fetched in parallel — independent requests, no reason to
 * serialize.
 */
async function loadOperationsIndex(
  options: {onlySlug?: string} = {},
): Promise<OperationIndexEntry[]> {
  const index = await fetchSpecIndex()
  const targets = options.onlySlug
    ? index.filter((entry) => entry.slug === options.onlySlug)
    : index
  const buckets = await Promise.all(targets.map((entry) => fetchAndParseEntry(entry)))
  return sortOperations(buckets.flat())
}

async function fetchAndParseEntry(entry: OpenApiSpecIndexEntry): Promise<OperationIndexEntry[]> {
  // Wrap both fetch and parse — one spec's 5xx / timeout / parse error
  // mustn't poison the whole `list` invocation. Per-spec failures are
  // debug-logged; the remaining 21 specs still surface to the user.
  try {
    const yaml = await fetchSpec(entry.slug)
    if (yaml === null) return []
    const parsed = await parseOpenApi(entry.slug, yaml)
    return parsed.operations.map((op) => ({...op, spec: entry.slug}))
  } catch (error) {
    debug(`skipping spec "${entry.slug}" — fetch/parse error`, error)
    return []
  }
}

/**
 * The user-facing message every command surfaces when the docs
 * service is unreachable. Lives next to the loader so the wrappers
 * in command files don't each redefine their own copy.
 */
export const DOCS_SERVICE_UNAVAILABLE =
  'The OpenAPI service is currently unavailable. Try again later.'

/**
 * Convenience wrapper around `loadOperationsIndex` that re-throws
 * network / parse errors as a single user-friendly Error. Saves
 * every consumer command from re-implementing the same try/catch
 * + `this.error(…)` shape.
 */
export async function loadOperationsIndexOrThrow(
  options: {onlySlug?: string} = {},
): Promise<OperationIndexEntry[]> {
  try {
    return await loadOperationsIndex(options)
  } catch (error) {
    debug('loadOperationsIndex failed', error)
    throw new Error(DOCS_SERVICE_UNAVAILABLE, {cause: error})
  }
}

/** Sort by spec asc → path asc → method asc — stable for diffability. */
function sortOperations(entries: OperationIndexEntry[]): OperationIndexEntry[] {
  return entries.toSorted((a, b) => {
    if (a.spec !== b.spec) return a.spec < b.spec ? -1 : 1
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    return a.method < b.method ? -1 : a.method > b.method ? 1 : 0
  })
}

/**
 * Result of a single-spec fetch. The raw YAML is kept alongside the
 * parsed form so the spec command can pass it straight through for
 * `--format=openapi`.
 */
interface LoadedSpec {
  index: OpenApiSpecIndexEntry
  parsed: ParsedSpec
  /** Raw YAML as returned by the docs endpoint. */
  yaml: string
}

/**
 * Fetch + parse a single spec by slug. Returns null when the slug
 * isn't in the docs index, or the spec body 404s. Throws on network
 * or parse errors so callers can translate into a user-facing message.
 */
async function loadSingleSpec(slug: string): Promise<LoadedSpec | null> {
  const index = await fetchSpecIndex()
  const entry = index.find((e) => e.slug === slug)
  if (!entry) return null

  const yaml = await fetchSpec(slug)
  if (yaml === null) return null

  const parsed = await parseOpenApi(slug, yaml)
  return {index: entry, parsed, yaml}
}

/**
 * Mirror of `loadOperationsIndexOrThrow` for single-spec loads —
 * re-throws fetch/parse errors as one user-friendly Error so callers
 * don't re-implement the same try/catch.
 */
export async function loadSingleSpecOrThrow(slug: string): Promise<LoadedSpec | null> {
  try {
    return await loadSingleSpec(slug)
  } catch (error) {
    debug('loadSingleSpec failed', error)
    throw new Error(DOCS_SERVICE_UNAVAILABLE, {cause: error})
  }
}
