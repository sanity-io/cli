/**
 * Which Sanity API host family a request targets.
 *
 * - `global` - `https://api.sanity.io` (projects, organizations, jobs, ...)
 * - `project` - `https://<projectId>.api.sanity.io` (data, agent actions, assets, ...)
 */
export type ApiHost = 'global' | 'project'

/**
 * A single API family entry in the generated routing manifest, distilled from
 * a published OpenAPI specification.
 */
export interface ApiRouteEntry {
  /** Which host family serves these paths. */
  host: ApiHost

  /**
   * Normalized path patterns for the endpoints in this spec: no leading slash and
   * no API version segment. Placeholders (eg `{dataset}`) match any path segment.
   */
  pathPatterns: string[]

  /** Spec slug, as used by `sanity openapi get <slug>`. */
  slug: string

  /** Human-readable spec title. */
  title: string

  /**
   * Default API version declared by the spec's server template (eg `v2021-06-07`),
   * if any.
   */
  defaultApiVersion?: string
}

/**
 * Minimal shape of an OpenAPI document needed to distill routing information.
 */
export interface OpenApiDocument {
  info?: {title?: string}
  paths?: Record<string, unknown>
  servers?: OpenApiServer[]
}

/**
 * An OpenAPI server entry (subset).
 */
interface OpenApiServer {
  url: string

  variables?: Record<string, {default?: string}>
}
