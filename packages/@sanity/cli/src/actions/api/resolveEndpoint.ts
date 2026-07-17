import {API_DEFAULT_VERSION, API_VERSION_SEGMENT_RE} from './constants.js'
import {ApiUsageError, ProjectIdRequiredError} from './errors.js'
import {type ApiHost, type ApiRouteEntry} from './types.js'

/**
 * Options for {@link resolveEndpoint}.
 */
export interface ResolveEndpointOptions {
  /** The endpoint argument: a path, optionally with placeholders, or a full URL. */
  endpoint: string

  /** The generated routing manifest. */
  routes: ApiRouteEntry[]

  /** Explicit API version (`--api-version`), wins over everything else. */
  apiVersion?: string

  /** Dataset used to fill `{dataset}` / `{datasetName}` placeholders. */
  dataset?: string

  /** Force a host family (`--global` / `--project-hosted`), skipping route matching. */
  forceHost?: ApiHost

  /** Project ID used to fill `{projectId}` placeholders and project-hosted requests. */
  projectId?: string
}

/**
 * A fully resolved request target.
 */
export type ResolvedEndpoint =
  | {
      /** API version path segment, eg `v2021-06-07`. */
      apiVersion: string
      host: ApiHost
      kind: 'path'
      /** Slug of the OpenAPI spec whose paths matched, if any. */
      matchedSlug?: string
      /** Version-less path, without leading slash. */
      path: string
      /** Project ID; always set when `host` is `project`. */
      projectId?: string
      /** Query parameters parsed from the endpoint argument. */
      query: Record<string, string | string[]>
    }
  | {
      kind: 'url'
      query: Record<string, string | string[]>
      /** Absolute URL, used verbatim (query string stripped into `query`). */
      url: string
    }

const PLACEHOLDER_RE = /^\{([^{}]+)\}$/

const ALLOWED_URL_HOST_RE = /(?:^|\.)api\.sanity\.(?:io|work)$/

/**
 * Resolve the endpoint argument of `sanity api` into a concrete request
 * target: substitute placeholders, split off the query string, determine the
 * host family (via the generated OpenAPI routing manifest) and the API
 * version.
 *
 * Throws {@link ProjectIdRequiredError} when the request needs a project ID
 * that hasn't been provided - the command catches this to resolve one (flags,
 * CLI config or interactive prompt) and retries.
 */
export function resolveEndpoint(options: ResolveEndpointOptions): ResolvedEndpoint {
  const {apiVersion, dataset, endpoint, forceHost, projectId, routes} = options

  if (/^https?:\/\//.test(endpoint)) {
    return resolveUrlEndpoint(endpoint)
  }

  const [pathPart = '', ...queryParts] = endpoint.split('?')
  const query = parseQueryString(queryParts.join('?'))

  const segments = pathPart.split('/').filter((segment) => segment !== '')
  if (segments.length === 0) {
    throw new ApiUsageError('Endpoint path is empty')
  }

  // An API version embedded in the path (eg `v2021-06-07/projects`) is peeled
  // off and re-applied as the version segment of the final URL.
  let embeddedVersion: string | undefined
  if (segments[0] === '{apiVersion}') {
    segments.shift()
  } else if (API_VERSION_SEGMENT_RE.test(segments[0])) {
    embeddedVersion = segments.shift()
  }

  const unresolved: string[] = []
  const substituted = segments.map((segment) => {
    const placeholder = PLACEHOLDER_RE.exec(segment)?.[1]
    if (!placeholder) return segment
    if (placeholder === 'projectId') {
      if (!projectId) throw new ProjectIdRequiredError()
      return projectId
    }
    if (placeholder === 'dataset' || placeholder === 'datasetName') {
      if (!dataset) {
        throw new ApiUsageError(
          `Unable to resolve {${placeholder}} - provide a dataset with --dataset or configure one in sanity.cli.ts`,
        )
      }
      return dataset
    }
    unresolved.push(segment)
    return segment
  })

  if (unresolved.length > 0) {
    throw new ApiUsageError(
      `Unable to resolve placeholder(s) ${unresolved.join(', ')} - replace them with actual values`,
    )
  }

  // Match against the (unsubstituted) user segments so that literal values
  // provided in place of placeholders still match the spec patterns.
  const match = forceHost ? undefined : matchRoutes(substituted, routes)
  const host = forceHost ?? match?.host ?? 'global'

  if (host === 'project' && !projectId) {
    throw new ProjectIdRequiredError()
  }

  return {
    apiVersion: apiVersion ?? embeddedVersion ?? match?.defaultApiVersion ?? API_DEFAULT_VERSION,
    host,
    kind: 'path',
    matchedSlug: match?.slug,
    path: substituted.join('/'),
    ...(host === 'project' ? {projectId} : {}),
    query,
  }
}

function resolveUrlEndpoint(endpoint: string): ResolvedEndpoint {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new ApiUsageError(`Invalid URL "${endpoint}"`)
  }

  if (!ALLOWED_URL_HOST_RE.test(url.hostname)) {
    throw new ApiUsageError(
      `Refusing to send authenticated requests to "${url.hostname}" - only *.api.sanity.io hosts are supported`,
    )
  }

  const query = parseQueryString(url.search.replace(/^\?/, ''))
  url.search = ''

  return {kind: 'url', query, url: url.toString()}
}

interface RouteMatch {
  host: ApiHost
  score: number
  slug: string

  defaultApiVersion?: string
}

/**
 * Find the route entry whose path pattern best matches the request segments.
 *
 * Patterns are compared segment by segment: literal matches score higher than
 * placeholder matches, and a literal mismatch disqualifies the pattern. On
 * equal scores the global host wins (APIs served on both hosts don't need a
 * project ID there).
 */
function matchRoutes(segments: string[], routes: ApiRouteEntry[]): RouteMatch | undefined {
  let best: RouteMatch | undefined

  for (const entry of routes) {
    for (const pattern of entry.pathPatterns) {
      const score = scorePattern(segments, pattern.split('/'))
      if (score === 0) continue
      const isBetter =
        !best || score > best.score || (score === best.score && entry.host === 'global')
      if (isBetter) {
        best = {
          defaultApiVersion: entry.defaultApiVersion,
          host: entry.host,
          score,
          slug: entry.slug,
        }
      }
    }
  }

  return best
}

function scorePattern(segments: string[], patternSegments: string[]): number {
  const length = Math.min(segments.length, patternSegments.length)
  let score = 0

  for (let index = 0; index < length; index++) {
    const patternSegment = patternSegments[index]
    if (PLACEHOLDER_RE.test(patternSegment)) {
      score += 1
    } else if (patternSegment === segments[index]) {
      score += 2
    } else {
      return 0
    }
  }

  // Require at least one literal segment match so a pattern like
  // `{libraryId}/...` can't capture arbitrary paths.
  if (score < 2) return 0

  // Prefer patterns the request path consumes completely over patterns that
  // merely share a prefix with it.
  return patternSegments.length <= segments.length ? score + 1 : score
}

function parseQueryString(queryString: string): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {}
  if (queryString === '') return query

  for (const [key, value] of new URLSearchParams(queryString)) {
    const existing = query[key]
    if (existing === undefined) {
      query[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      query[key] = [existing, value]
    }
  }

  return query
}
