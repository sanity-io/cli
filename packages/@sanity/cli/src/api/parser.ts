import {subdebug} from '@sanity/cli-core'
import {parse as parseYaml} from 'yaml'

import {readSpec} from './cache.js'
import {type OpenApiSpecIndexEntry} from './docsClient.js'

const debug = subdebug('api:parser')

/* ---------------------------------------------------------------------- *
 *  Capability classification                                              *
 * ---------------------------------------------------------------------- */

/**
 * Method-based capability classification.
 *
 * `GET`/`HEAD`/`OPTIONS` → `read` (untagged in list output).
 * `PATCH`/`PUT`/`DELETE` → `destructive` (Phase 2 destructive guard fires).
 * `POST`                 → `write`.
 *
 * Method-only by design — no path-name inspection. Keeps the rule
 * auditable and matches the Phase 2 guard that reads this same field.
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
  /** Native OpenAPI path with `{name}` placeholders. */
  path: string
  pathParams: string[]
  requiredQueryParams: string[]
  summary: string

  /** Spec slug; populated by buildOperationsIndex, not the parser. */
  spec?: string
}

/** One parsed spec — header info plus its denormalized operations. */
interface ParsedSpec {
  description: string
  operations: ParsedOperation[]
  /** OpenAPI `servers[0].url` template with `:name` placeholders. */
  serverTemplate: string
  slug: string
  title: string
  /** `info.version`, e.g. `v2021-06-07`. */
  version: string
}

/** Flat operations index — one row per (spec, operation). */
export type OperationIndexEntry = ParsedOperation & {spec: string}

/* ---------------------------------------------------------------------- *
 *  URL Pattern helpers                                                    *
 * ---------------------------------------------------------------------- */

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

/**
 * Server variables that are runtime context (filled by `--project`,
 * `--dataset`, etc. at call time), not build-time defaults. These get
 * left as `:name` placeholders in `serverTemplate` so Phase 2 can
 * resolve them when actually executing a call.
 */
const CONTEXT_SERVER_VARS = new Set(['dataset', 'organizationId', 'projectId'])

/** Convert `{name}` placeholders in a URL/path to `:name` (URL Pattern API). */
export function toUrlPatternForm(value: string): string {
  return value.replaceAll(/\{([^}]+)\}/g, ':$1')
}

/* ---------------------------------------------------------------------- *
 *  OpenAPI parser                                                         *
 * ---------------------------------------------------------------------- */

interface ParameterObject {
  in?: string
  name?: string
  required?: boolean
}

interface ServerVariable {
  default?: string
  description?: string
}

/**
 * Substitute server-variable defaults into a server URL template.
 *
 * `preserveContext: true` leaves `{projectId}` / `{dataset}` /
 * `{organizationId}` alone so they survive into the URL-Pattern form
 * as `:name` placeholders (filled by Phase 2 at call time, or
 * displayed verbatim by Phase 1's `list`).
 */
function substituteServerVars(
  rawUrl: string,
  vars: Record<string, ServerVariable>,
  options: {preserveContext: boolean},
): string {
  let url = rawUrl
  for (const [name, variable] of Object.entries(vars)) {
    if (options.preserveContext && CONTEXT_SERVER_VARS.has(name)) continue
    if (variable?.default !== undefined) {
      url = url.replaceAll(`{${name}}`, variable.default)
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
 *
 * E.g.
 *   `https://api.sanity.io/v2021-06-07`               → `v2021-06-07`
 *   `https://api.sanity.io/vX/agent`                  → `vX/agent`
 *   `https://api.sanity.io/v2025-02-19/projects/{projectId}` → `v2025-02-19/projects/{projectId}`
 *   `https://{projectId}.api.sanity.io/v2025-02-19`   → `v2025-02-19`
 *   `https://api.sanity.io`                           → empty string
 */
function extractServerPathSegment(serverUrlWithPlaceholders: string): string {
  if (!serverUrlWithPlaceholders) return ''
  const match = serverUrlWithPlaceholders.match(/^[a-z]+:\/\/[^/]+(\/.*)?$/i)
  if (!match) return ''
  const pathname = match[1] || ''
  return pathname.replaceAll(/^\/+|\/+$/g, '')
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function collectParamNames(
  params: ParameterObject[],
  location: 'header' | 'path' | 'query',
  opts?: {requiredOnly?: boolean},
): string[] {
  const out: string[] = []
  for (const p of params) {
    if (!p || typeof p !== 'object') continue
    if (p.in !== location) continue
    if (opts?.requiredOnly && p.required !== true) continue
    const name = asString(p.name)
    if (name) out.push(name)
  }
  return out
}

function isStreamingResponse(responses: unknown): boolean {
  if (!responses || typeof responses !== 'object') return false
  const ok = (responses as Record<string, unknown>)['200']
  if (!ok || typeof ok !== 'object') return false
  const content = (ok as Record<string, unknown>).content
  if (!content || typeof content !== 'object') return false
  return Boolean((content as Record<string, unknown>)['text/event-stream'])
}

/**
 * Parse an OpenAPI spec (YAML string) into the CLI's denormalized form.
 *
 * Throws if the YAML is invalid or the document isn't an OpenAPI spec.
 */
export function parseOpenApi(slug: string, yaml: string): ParsedSpec {
  const doc = parseYaml(yaml)
  if (!doc || typeof doc !== 'object') {
    throw new Error(`Spec "${slug}" did not parse to an object`)
  }
  const root = doc as Record<string, unknown>

  const info = (root.info && typeof root.info === 'object' ? root.info : {}) as Record<
    string,
    unknown
  >
  const title = asString(info.title) || slug
  const description = asString(info.description)
  const version = asString(info.version)

  const servers = asArray<Record<string, unknown>>(root.servers)
  const serverObj = servers[0] || {}
  const serverUrlRaw = asString(serverObj.url)
  const serverVars =
    serverObj.variables && typeof serverObj.variables === 'object'
      ? (serverObj.variables as Record<string, ServerVariable>)
      : {}

  // The version path-segment lives in the resolved server URL's pathname
  // — NOT `info.version` (which can be a meaningless semver like `1.0.0`
  // for specs whose API version is declared in server variables, or
  // baked literally into the OpenAPI `paths` keys).
  //
  // We preserve `{projectId}` / `{dataset}` / `{organizationId}` so they
  // survive as `:name` placeholders in the final URL-Pattern form
  // (otherwise specs that put `{projectId}` in the path would render as
  // the literal default value like `projectId`).
  const serverUrlWithContextVars = substituteServerVars(serverUrlRaw, serverVars, {
    preserveContext: true,
  })
  const serverPathSegment = extractServerPathSegment(serverUrlWithContextVars)
  const serverTemplate = toUrlPatternForm(serverUrlWithContextVars)

  const paths = (root.paths && typeof root.paths === 'object' ? root.paths : {}) as Record<
    string,
    unknown
  >

  const operations: ParsedOperation[] = []
  for (const [rawPath, pathItemRaw] of Object.entries(paths)) {
    if (!pathItemRaw || typeof pathItemRaw !== 'object') continue
    const pathItem = pathItemRaw as Record<string, unknown>
    const commonParams = asArray<ParameterObject>(pathItem.parameters)

    for (const method of HTTP_METHODS) {
      const opRaw = pathItem[method]
      if (!opRaw || typeof opRaw !== 'object') continue
      const op = opRaw as Record<string, unknown>

      const opParams = asArray<ParameterObject>(op.parameters)
      const allParams = [...commonParams, ...opParams]

      const pathParams = collectParamNames(allParams, 'path')
      const requiredQueryParams = collectParamNames(allParams, 'query', {requiredOnly: true})

      const methodUpper = method.toUpperCase()
      const opPath = rawPath.replace(/^\/+/, '')
      const combined = serverPathSegment ? `${serverPathSegment}/${opPath}` : opPath
      const endpoint = toUrlPatternForm(combined)

      operations.push({
        capability: classifyCapability(methodUpper),
        endpoint,
        isStreaming: isStreamingResponse(op.responses),
        method: methodUpper,
        operationId: asString(op.operationId),
        path: rawPath,
        pathParams,
        requiredQueryParams,
        summary: asString(op.summary),
      })
    }
  }

  return {description, operations, serverTemplate, slug, title, version}
}

/* ---------------------------------------------------------------------- *
 *  Index builder + cache loader                                           *
 * ---------------------------------------------------------------------- */

/**
 * Flatten parsed specs into a single sorted operations array.
 *
 * Sort order matches the `list` table in the spec: spec asc → path asc → method asc.
 * Stable ordering matters for diffability and agent re-runs.
 */
export function buildOperationsIndex(specs: ParsedSpec[]): OperationIndexEntry[] {
  const entries: OperationIndexEntry[] = []
  for (const spec of specs) {
    for (const op of spec.operations) {
      entries.push({...op, spec: spec.slug})
    }
  }
  entries.sort((a, b) => {
    if (a.spec !== b.spec) return a.spec < b.spec ? -1 : 1
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    return a.method < b.method ? -1 : a.method > b.method ? 1 : 0
  })
  return entries
}

/**
 * For each index entry, read the cached YAML and parse it.
 *
 * Skips entries we don't have on disk (revalidation hasn't run, or the
 * entry was added upstream after our last fetch). Skips entries whose
 * YAML fails to parse — debug-logged so they show up under
 * `DEBUG=sanity:cli:api:parser` without breaking the caller.
 */
export async function loadParsedSpecs(index: OpenApiSpecIndexEntry[]): Promise<ParsedSpec[]> {
  const specs: ParsedSpec[] = []
  for (const entry of index) {
    const yaml = await readSpec(entry.slug)
    if (yaml === null) continue
    try {
      const parsed = parseOpenApi(entry.slug, yaml)
      specs.push({
        ...parsed,
        description: entry.description || parsed.description,
        slug: entry.slug,
        title: entry.title || parsed.title,
      })
    } catch (error) {
      debug(`skipping spec "${entry.slug}" — parse error`, error)
    }
  }
  return specs
}
