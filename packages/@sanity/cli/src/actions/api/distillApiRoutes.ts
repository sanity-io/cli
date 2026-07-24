import {API_VERSION_SEGMENT_RE} from './constants.js'
import {type ApiHost, type ApiRouteEntry, type OpenApiDocument} from './types.js'

/**
 * A fetched OpenAPI specification, ready for distillation.
 */
export interface SpecSource {
  document: OpenApiDocument
  slug: string
  title: string
}

interface ServerBase {
  host: ApiHost
  segments: string[]

  defaultApiVersion?: string
}

/**
 * Distill fetched OpenAPI specifications into the routing manifest used by
 * `sanity api` to decide which host serves a request path and which API
 * version to default to.
 *
 * The output is deterministic (sorted) so the generated manifest can be
 * compared against a fresh distillation to detect drift.
 */
export function distillApiRoutes(specs: SpecSource[]): ApiRouteEntry[] {
  const entries: ApiRouteEntry[] = []

  for (const {document, slug, title} of specs) {
    const servers = document.servers ?? []
    const paths = Object.keys(document.paths ?? {})
    if (servers.length === 0 || paths.length === 0) continue

    // A spec may be served on both hosts (eg the Applications API). Emit one
    // entry per host, each carrying the full set of path patterns.
    const byHost = new Map<ApiHost, ServerBase>()
    for (const server of servers) {
      const base = parseServerUrl(server.url, server.variables)
      if (!base) continue
      if (!byHost.has(base.host)) byHost.set(base.host, base)
    }

    for (const base of byHost.values()) {
      const patterns = new Set<string>()
      let defaultApiVersion = base.defaultApiVersion

      for (const path of paths) {
        const {segments, version} = normalizePathSegments(path)
        defaultApiVersion = defaultApiVersion ?? version
        const pattern = [...base.segments, ...segments].join('/')
        if (pattern !== '') patterns.add(pattern)
      }

      if (patterns.size === 0) continue

      entries.push({
        ...(defaultApiVersion === undefined ? {} : {defaultApiVersion}),
        host: base.host,
        pathPatterns: [...patterns].toSorted(),
        slug,
        title,
      })
    }
  }

  return entries.toSorted((a, b) => a.slug.localeCompare(b.slug) || a.host.localeCompare(b.host))
}

/**
 * Parse an OpenAPI server URL template (eg
 * `https://{projectId}.api.sanity.io/{apiVersion}/agent/action`) into a host
 * classification, base path segments and a default API version.
 *
 * Returns `undefined` for URLs that don't look like a Sanity API host.
 */
function parseServerUrl(
  url: string,
  variables?: Record<string, {default?: string}>,
): ServerBase | undefined {
  const withoutScheme = url.replace(/^https?:\/\//, '')
  const [hostname = '', ...pathSegments] = withoutScheme.split('/')

  if (!hostname.includes('api.sanity.io') && !hostname.includes('api.sanity.work')) {
    return undefined
  }

  const host: ApiHost = hostname.includes('{projectId}') ? 'project' : 'global'

  let defaultApiVersion = normalizeVersion(variables?.apiVersion?.default)
  const segments: string[] = []
  for (const segment of pathSegments) {
    if (segment === '') continue
    if (segment === '{apiVersion}') continue
    if (API_VERSION_SEGMENT_RE.test(segment)) {
      defaultApiVersion = defaultApiVersion ?? segment
      continue
    }
    segments.push(segment)
  }

  return {defaultApiVersion, host, segments}
}

/**
 * Normalize an OpenAPI path template into version-less path segments, plus the
 * API version if one was embedded in the path (eg `/v2024-07-01/access/...`).
 *
 * Some specs carry a stray query marker in the path key (eg `/foo/{id}?`) -
 * anything from `?` on is not part of the path and is dropped.
 */
function normalizePathSegments(path: string): {segments: string[]; version?: string} {
  const [pathPart = ''] = path.split('?')
  const segments = pathPart.split('/').filter((segment) => segment !== '')
  let version: string | undefined

  if (segments[0] === '{apiVersion}') {
    segments.shift()
  } else if (segments.length > 0 && API_VERSION_SEGMENT_RE.test(segments[0])) {
    version = segments.shift()
  }

  return {segments, version}
}

function normalizeVersion(version: string | undefined): string | undefined {
  if (!version) return undefined
  return API_VERSION_SEGMENT_RE.test(version) ? version : undefined
}
