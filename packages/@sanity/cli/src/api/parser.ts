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

/** A request parameter (path / query / header). */
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
 * via `sanity api spec <slug> --schema <name>` rather than getting
 * a pre-expanded tree.
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
  /** Referenced schemas appearing at the body root (via `$ref` or composition). */
  refs: string[]
  required: boolean
  /** One-line summary, used for non-JSON or as a header above `fields`. */
  schemaSummary: string
}

export interface ParsedResponse {
  contentType: string
  schemaSummary: string
  /** HTTP status code as a number, or `0` for `default` (rare in Sanity specs). */
  status: number

  /** When the response schema is a `$ref`, the referenced schema name. */
  ref?: string
}

interface SecurityScheme {
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
  /** Native OpenAPI path with `{name}` placeholders. */
  path: string
  pathParams: ParsedParam[]
  queryParams: ParsedParam[]
  requestBody: ParsedRequestBody | null
  responses: ParsedResponse[]
  security: SecurityScheme[]
  summary: string

  /** Spec slug; populated by buildOperationsIndex, not the parser. */
  spec?: string
}

/** One parsed spec — header info plus its denormalized operations. */
export interface ParsedSpec {
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
 *  Generic helpers                                                        *
 * ---------------------------------------------------------------------- */

interface ServerVariable {
  default?: string
  description?: string
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * Extract the schema name from a `#/components/schemas/Foo` pointer.
 * Returns an empty string for non-local or malformed refs — we don't
 * follow remote refs, and any spec that ships one is broken anyway.
 */
function refName(ref: string): string {
  if (!ref.startsWith('#/components/schemas/')) return ''
  return ref.slice('#/components/schemas/'.length)
}

/* ---------------------------------------------------------------------- *
 *  Server URL helpers                                                     *
 * ---------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------- *
 *  Schema → type label                                                    *
 * ---------------------------------------------------------------------- */

/**
 * One-word type label suitable for table / help display.
 *
 * Refs collapse to the schema name (`'Foo'`) so the output is
 * immediately useful without resolution. Composition collapses to
 * `'object'` — the body walker handles `allOf`/`oneOf`/`anyOf` itself.
 */
function describeType(schema: Record<string, unknown>): string {
  const ref = asString(schema.$ref)
  if (ref) {
    const name = refName(ref)
    return name || 'unknown'
  }
  const t = asString(schema.type)
  if (t) {
    if (t === 'array') {
      const items = asObject(schema.items)
      const inner = describeType(items)
      return inner === 'unknown' ? 'array' : `${inner}[]`
    }
    return t
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return typeof schema.enum[0] === 'number' ? 'number' : 'string'
  }
  if (Array.isArray(schema.allOf) || Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    return 'object'
  }
  return 'unknown'
}

/** Compact `{ a, b, c }` summary of an inline object schema. */
function summarizeInlineObject(properties: Record<string, unknown>): string {
  const names = Object.keys(properties)
  if (names.length === 0) return ''
  const head = names.slice(0, 6).join(', ')
  return names.length > 6 ? `{ ${head}, … }` : `{ ${head} }`
}

/* ---------------------------------------------------------------------- *
 *  Parameter extraction                                                   *
 * ---------------------------------------------------------------------- */

/**
 * Resolve a `#/components/parameters/<name>` ref against the spec root.
 * Unlike schema refs (which we link-not-resolve), parameter refs MUST
 * resolve — path params especially: without them, the URL template
 * loses placeholders and the operation becomes uncallable.
 *
 * Parameter refs are inline, simple, and don't recurse, so resolution
 * is cheap and cycle-free.
 */
function resolveParameterRef(
  ref: string,
  root: Record<string, unknown>,
): Record<string, unknown> | null {
  const prefix = '#/components/parameters/'
  if (!ref.startsWith(prefix)) return null
  const name = ref.slice(prefix.length)
  const components = asObject(root.components)
  const parameters = asObject(components.parameters)
  const target = parameters[name]
  return target && typeof target === 'object' ? (target as Record<string, unknown>) : null
}

/**
 * Convert one OpenAPI parameter object into a `ParsedParam`. Pulls
 * metadata from both the param level and its `schema` (OpenAPI lets
 * `enum`/`default`/`example` live on either).
 *
 * Returns `null` for malformed params (no `name`/`in`) so callers can
 * filter without crashing on bad specs.
 */
function parseParam(rawParam: unknown, root: Record<string, unknown>): ParsedParam | null {
  let param = asObject(rawParam)
  const paramRef = asString(param.$ref)
  if (paramRef) {
    const resolved = resolveParameterRef(paramRef, root)
    if (!resolved) return null
    param = resolved
  }

  const name = asString(param.name)
  const location = asString(param.in)
  if (!name || (location !== 'path' && location !== 'query' && location !== 'header')) {
    return null
  }

  const schema = asObject(param.schema)
  const enumValues =
    asArray<number | string>(schema.enum).length > 0
      ? asArray<number | string>(schema.enum)
      : asArray<number | string>(param.enum)

  const parsed: ParsedParam = {
    description: asString(param.description) || asString(schema.description),
    in: location,
    name,
    required: location === 'path' ? true : param.required === true,
    type: describeType(schema),
  }
  const schemaRef = asString(schema.$ref)
  if (schemaRef) {
    const name = refName(schemaRef)
    if (name) parsed.ref = name
  }
  if (enumValues.length > 0) parsed.enum = enumValues
  const defaultValue = schema.default ?? param.default
  if (defaultValue !== undefined) parsed.default = defaultValue
  const exampleValue = schema.example ?? param.example
  if (exampleValue !== undefined) parsed.example = exampleValue
  return parsed
}

/* ---------------------------------------------------------------------- *
 *  Request body extraction                                                *
 * ---------------------------------------------------------------------- */

/**
 * Walk one property schema into a `ParsedBodyField`. Refs stop here:
 * the ref name lands on `ref`, recursion does not follow.
 *
 * Inline objects recurse one level; arrays-of-objects recurse into
 * their element schema. We don't cap recursion artificially — refs
 * are the natural terminator for the deep specs (agent-actions).
 */
function walkProperty(name: string, rawSchema: unknown, isRequired: boolean): ParsedBodyField {
  const schema = asObject(rawSchema)
  const ref = asString(schema.$ref)
  const refSchemaName = ref ? refName(ref) : ''

  const field: ParsedBodyField = {
    description: asString(schema.description),
    fields: [],
    name,
    required: isRequired,
    type: describeType(schema),
  }
  if (refSchemaName) field.ref = refSchemaName
  const enumValues = asArray<number | string>(schema.enum)
  if (enumValues.length > 0) field.enum = enumValues
  if (schema.default !== undefined) field.default = schema.default

  // Don't follow refs — that's the whole point of the link-not-resolve approach.
  if (ref) return field

  // Inline object: walk one level deeper.
  if (asString(schema.type) === 'object' || asObject(schema.properties).constructor === Object) {
    field.fields = walkProperties(schema)
  } else if (asString(schema.type) === 'array') {
    const items = asObject(schema.items)
    if (asString(items.type) === 'object' || asObject(items.properties).constructor === Object) {
      field.fields = walkProperties(items)
    }
  }
  return field
}

/**
 * Pull `{name, schema, required}` out of an inline object schema.
 * Composition is handled by `flattenComposition` before this is called —
 * here we just enumerate `properties`.
 */
function walkProperties(schema: Record<string, unknown>): ParsedBodyField[] {
  const properties = asObject(schema.properties)
  const required = new Set(asArray<string>(schema.required))
  const fields: ParsedBodyField[] = []
  for (const [propName, propSchema] of Object.entries(properties)) {
    fields.push(walkProperty(propName, propSchema, required.has(propName)))
  }
  return fields
}

/**
 * Flatten `allOf` at a schema root by collecting inline properties from
 * every variant. `oneOf`/`anyOf` pick the first variant. Refs at any
 * variant slot are returned via `refs` for the caller to surface as
 * follow-up pointers.
 */
function flattenComposition(schema: Record<string, unknown>): {
  fields: ParsedBodyField[]
  refs: string[]
} {
  const refs = new Set<string>()
  const ownFields = walkProperties(schema)
  const fieldsByName = new Map(ownFields.map((f) => [f.name, f]))

  const ownRef = asString(schema.$ref)
  if (ownRef) {
    const name = refName(ownRef)
    if (name) refs.add(name)
  }

  for (const variant of asArray<Record<string, unknown>>(schema.allOf)) {
    const sub = flattenComposition(variant)
    for (const f of sub.fields) {
      if (!fieldsByName.has(f.name)) {
        fieldsByName.set(f.name, f)
      }
    }
    for (const r of sub.refs) refs.add(r)
  }

  for (const key of ['oneOf', 'anyOf'] as const) {
    const variants = asArray<Record<string, unknown>>(schema[key])
    for (const variant of variants) {
      const variantRef = asString(variant.$ref)
      if (variantRef) {
        const name = refName(variantRef)
        if (name) refs.add(name)
        continue
      }
      // For inline variants, take the first one's properties to keep the
      // output usable. oneOf-of-refs (the common case) lands in `refs`.
      if (variants.indexOf(variant) === 0) {
        const sub = flattenComposition(variant)
        for (const f of sub.fields) {
          if (!fieldsByName.has(f.name)) fieldsByName.set(f.name, f)
        }
        for (const r of sub.refs) refs.add(r)
      }
    }
  }

  return {fields: [...fieldsByName.values()], refs: [...refs]}
}

/**
 * Pick the canonical media type from a `requestBody.content` map.
 * Prefers `application/json`; otherwise returns the first declared
 * media type (covering `multipart/form-data`, `image/*`, etc).
 */
function pickContentType(content: Record<string, unknown>): string {
  const keys = Object.keys(content)
  if (keys.length === 0) return ''
  if ('application/json' in content) return 'application/json'
  return keys[0]
}

function isJsonContentType(contentType: string): boolean {
  return contentType === 'application/json' || contentType.endsWith('+json')
}

function summarizeBodySchema(schema: Record<string, unknown>, refs: string[]): string {
  const props = asObject(schema.properties)
  const inline = summarizeInlineObject(props)
  if (inline) return inline
  if (refs.length > 0) return refs.length === 1 ? refs[0] : `oneOf(${refs.join(', ')})`
  return describeType(schema)
}

function parseRequestBody(opRaw: Record<string, unknown>): ParsedRequestBody | null {
  const body = asObject(opRaw.requestBody)
  if (asString(body.$ref)) return null // Rare; specs we own don't use it.
  const content = asObject(body.content)
  if (Object.keys(content).length === 0) return null

  const contentType = pickContentType(content)
  const mediaTypeObj = asObject(content[contentType])
  const schema = asObject(mediaTypeObj.schema)

  if (!isJsonContentType(contentType)) {
    return {
      contentType,
      fields: [],
      refs: [],
      required: body.required === true,
      schemaSummary: `<${contentType}>`,
    }
  }

  const {fields, refs} = flattenComposition(schema)
  return {
    contentType,
    fields,
    refs,
    required: body.required === true,
    schemaSummary: summarizeBodySchema(schema, refs),
  }
}

/* ---------------------------------------------------------------------- *
 *  Response extraction                                                    *
 * ---------------------------------------------------------------------- */

function parseResponses(opRaw: Record<string, unknown>): ParsedResponse[] {
  const responses = asObject(opRaw.responses)
  const out: ParsedResponse[] = []
  for (const [statusKey, rawResponse] of Object.entries(responses)) {
    const status = statusKey === 'default' ? 0 : Number.parseInt(statusKey, 10)
    if (!Number.isFinite(status) && statusKey !== 'default') continue
    const response = asObject(rawResponse)
    if (asString(response.$ref)) continue // Skip ref'd responses; uncommon in our specs.

    const content = asObject(response.content)
    const contentType = pickContentType(content)
    const mediaObj = asObject(content[contentType])
    const schema = asObject(mediaObj.schema)

    let schemaSummary = ''
    let ref: string | undefined
    if (contentType) {
      const schemaRef = asString(schema.$ref)
      if (schemaRef) {
        const name = refName(schemaRef)
        if (name) {
          ref = name
          schemaSummary = name
        }
      } else if (isJsonContentType(contentType)) {
        const props = asObject(schema.properties)
        schemaSummary =
          summarizeInlineObject(props) ||
          (Object.keys(schema).length > 0 ? describeType(schema) : '')
      } else {
        schemaSummary = `<${contentType}>`
      }
    }

    const entry: ParsedResponse = {contentType, schemaSummary, status}
    if (ref) entry.ref = ref
    out.push(entry)
  }
  return out.toSorted((a, b) => a.status - b.status)
}

/* ---------------------------------------------------------------------- *
 *  Security extraction                                                    *
 * ---------------------------------------------------------------------- */

/**
 * Specs inconsistently spell `BearerAuth` / `bearerAuth`. Same scheme
 * either way; we capitalize the first letter so display is uniform.
 */
function normalizeSchemeName(name: string): string {
  if (!name) return ''
  return name[0].toUpperCase() + name.slice(1)
}

function parseSecurity(opRaw: Record<string, unknown>, rootSecurity: unknown): SecurityScheme[] {
  const opSecurity = asArray<Record<string, unknown>>(opRaw.security)
  const source = opSecurity.length > 0 ? opSecurity : asArray<Record<string, unknown>>(rootSecurity)
  const schemes = new Set<string>()
  for (const requirement of source) {
    for (const key of Object.keys(requirement)) schemes.add(normalizeSchemeName(key))
  }
  return [...schemes].map((scheme) => ({scheme}))
}

/* ---------------------------------------------------------------------- *
 *  Streaming detection                                                    *
 * ---------------------------------------------------------------------- */

function isStreamingResponse(responses: ParsedResponse[]): boolean {
  return responses.some((r) => r.status === 200 && r.contentType === 'text/event-stream')
}

/* ---------------------------------------------------------------------- *
 *  Schema lookup (for `sanity api spec <slug> --schema <name>`)           *
 * ---------------------------------------------------------------------- */

/**
 * Return the raw `components.schemas.<name>` object from a spec YAML,
 * or `null` if the schema doesn't exist. Used by the `--schema` flag
 * on `api spec` to let agents follow ref pointers.
 */
export function lookupComponentSchema(yaml: string, name: string): unknown {
  const doc = parseYaml(yaml)
  if (!doc || typeof doc !== 'object') return null
  const components = asObject((doc as Record<string, unknown>).components)
  const schemas = asObject(components.schemas)
  return name in schemas ? schemas[name] : null
}

/** List all `components.schemas` keys defined by a spec. */
export function listComponentSchemas(yaml: string): string[] {
  const doc = parseYaml(yaml)
  if (!doc || typeof doc !== 'object') return []
  const components = asObject((doc as Record<string, unknown>).components)
  const schemas = asObject(components.schemas)
  return Object.keys(schemas)
}

/* ---------------------------------------------------------------------- *
 *  OpenAPI parser                                                         *
 * ---------------------------------------------------------------------- */

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

  const info = asObject(root.info)
  const title = asString(info.title) || slug
  const description = asString(info.description)
  const version = asString(info.version)

  const servers = asArray<Record<string, unknown>>(root.servers)
  const serverObj = servers[0] || {}
  const serverUrlRaw = asString(serverObj.url)
  const serverVars = asObject(serverObj.variables) as Record<string, ServerVariable>

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

  const rootSecurity = root.security
  const paths = asObject(root.paths)

  const operations: ParsedOperation[] = []
  for (const [rawPath, pathItemRaw] of Object.entries(paths)) {
    const pathItem = asObject(pathItemRaw)
    if (Object.keys(pathItem).length === 0) continue
    const commonParams = asArray<unknown>(pathItem.parameters)

    for (const method of HTTP_METHODS) {
      const opRaw = pathItem[method]
      const op = asObject(opRaw)
      if (Object.keys(op).length === 0) continue

      const opParams = asArray<unknown>(op.parameters)
      const allParams = [...commonParams, ...opParams]
        .map((raw) => parseParam(raw, root))
        .filter((p): p is ParsedParam => p !== null)

      const pathParams = allParams.filter((p) => p.in === 'path')
      const queryParams = allParams.filter((p) => p.in === 'query')
      const headerParams = allParams.filter((p) => p.in === 'header')

      const requestBody = parseRequestBody(op)
      const responses = parseResponses(op)
      const security = parseSecurity(op, rootSecurity)

      const methodUpper = method.toUpperCase()
      const opPath = rawPath.replace(/^\/+/, '')
      const combined = serverPathSegment ? `${serverPathSegment}/${opPath}` : opPath
      const endpoint = toUrlPatternForm(combined)

      operations.push({
        capability: classifyCapability(methodUpper),
        description: asString(op.description),
        endpoint,
        headerParams,
        isStreaming: isStreamingResponse(responses),
        method: methodUpper,
        operationId: asString(op.operationId),
        path: rawPath,
        pathParams,
        queryParams,
        requestBody,
        responses,
        security,
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
