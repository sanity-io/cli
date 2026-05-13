import {subdebug} from '@sanity/cli-core'
import {validate} from '@scalar/openapi-parser'
import {type OpenAPIV3, type OpenAPIV3_1} from '@scalar/openapi-types'

import {fetchSpec, fetchSpecIndex, type OpenApiSpecIndexEntry} from './docsClient.js'

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

/** One parsed operation, denormalized for the CLI's operations index. */
interface ParsedOperation {
  capability: Capability
  /** `<api-version>/<path>` with `:name` placeholders (URL Pattern API style). */
  endpoint: string
  isStreaming: boolean
  /** Uppercase HTTP method: `GET`, `POST`, … */
  method: string
  operationId: string
  optionalQueryParams: string[]
  /** Native OpenAPI path with `{name}` placeholders. */
  path: string
  pathParams: string[]
  requiredQueryParams: string[]
  summary: string
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

/**
 * A 3.0-or-3.1 operation. Sanity's public specs use both major versions;
 * the fields we read (parameters, responses, operationId, summary) live
 * at the same paths in both, so we union the operation types.
 */
type OperationObject = OpenAPIV3.OperationObject | OpenAPIV3_1.OperationObject
type PathItemObject = OpenAPIV3.PathItemObject | OpenAPIV3_1.PathItemObject
type ParameterObject = OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject

function isParameterObject(p: unknown): p is ParameterObject {
  return Boolean(p && typeof p === 'object' && !('$ref' in p))
}

function collectParamNames(
  params: (OpenAPIV3.ReferenceObject | ParameterObject)[] | undefined,
  location: 'header' | 'path' | 'query',
  opts?: {required?: boolean},
): string[] {
  if (!params) return []
  // Per OpenAPI 3.x, operation-level params override path-item-level
  // params with the same `(name, in)`. Last-wins via a name-keyed set
  // dedupes when both levels declare the same param.
  const out = new Set<string>()
  for (const p of params) {
    if (!isParameterObject(p)) continue
    if (p.in !== location) continue
    if (opts?.required !== undefined && (p.required === true) !== opts.required) continue
    if (p.name) out.add(p.name)
  }
  return [...out]
}

function isStreamingResponse(responses: OperationObject['responses']): boolean {
  if (!responses) return false
  const ok = (responses as Record<string, unknown>)['200']
  if (!ok || typeof ok !== 'object' || '$ref' in ok) return false
  const content = (ok as OpenAPIV3.ResponseObject).content
  return Boolean(content && content['text/event-stream'])
}

/**
 * Parse an OpenAPI spec (YAML or JSON string) into a flat list of
 * operations. Validation goes through `@scalar/openapi-parser`, which
 * leaves `$ref`s in place (link-not-resolve) and returns a typed AST
 * for the matched OpenAPI version.
 *
 * Strict validation warnings (missing descriptions, unbound path params,
 * etc.) are not fatal — surfaces whatever it can read. Only hard parse
 * failures (`specification` missing entirely) throw.
 *
 * Operations without an `operationId` are skipped and debug-logged.
 */
export async function parseOpenApi(slug: string, yaml: string): Promise<ParsedOperation[]> {
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
    const commonParams = pathItemObj.parameters

    for (const method of HTTP_METHODS) {
      const op = pathItemObj[method as HttpMethod] as OperationObject | undefined
      if (!op) continue

      const methodUpper = method.toUpperCase()
      const operationId = op.operationId ?? ''
      if (!operationId) {
        // Agent consumers index by `operationId`; emitting `''` would
        // collide silently. Skip and surface under DEBUG=sanity:cli:api:parser.
        debug(`skipping ${methodUpper} ${rawPath} — missing operationId`)
        continue
      }

      const allParams = [...(commonParams ?? []), ...(op.parameters ?? [])]
      const pathParams = collectParamNames(allParams, 'path')
      const requiredQueryParams = collectParamNames(allParams, 'query', {required: true})
      const optionalQueryParams = collectParamNames(allParams, 'query', {required: false})

      const opPath = rawPath.replace(/^\/+/, '')
      const combined = serverPathSegment ? `${serverPathSegment}/${opPath}` : opPath
      const endpoint = toUrlPatternForm(combined)

      operations.push({
        capability: classifyCapability(methodUpper),
        endpoint,
        isStreaming: isStreamingResponse(op.responses),
        method: methodUpper,
        operationId,
        optionalQueryParams,
        path: rawPath,
        pathParams,
        requiredQueryParams,
        summary: op.summary ?? '',
      })
    }
  }

  return operations
}

/* ---------------------------------------------------------------------- *
 *  Operations index loader                                                *
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
 *   - Per-spec 404s are skipped silently (the index lied or the spec
 *     was deleted between calls).
 *   - Per-spec parse errors are debug-logged and skipped (visible
 *     under `DEBUG=sanity:cli:api:parser`) without breaking the run.
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
    const operations = await parseOpenApi(entry.slug, yaml)
    return operations.map((op) => ({...op, spec: entry.slug}))
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
