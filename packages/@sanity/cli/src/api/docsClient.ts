/**
 * The HTTP layer talking to `sanity.io/docs/api/openapi`.
 *
 * - `fetchSpecIndex` → the index endpoint (one entry per public spec)
 * - `fetchSpec`      → one spec's body by slug
 *
 * Both share base-URL resolution (`SANITY_DOCS_API_URL`) and Vercel SSO
 * bypass-token handling (`SANITY_DOCS_API_BYPASS_TOKEN`), so they live
 * in one module.
 */

const DEFAULT_DOCS_API_URL = 'https://www.sanity.io/docs'
const FETCH_TIMEOUT_MS = 10_000

/**
 * Public HTTP Reference docs URL — shared by every command that
 * surfaces a docs link or accepts `--web` to open the docs site.
 */
export const HTTP_REFERENCE_URL = 'https://www.sanity.io/docs/http-reference'

/** Build the public docs URL for a single spec slug. */
export function docsUrlFor(slug: string): string {
  return `${HTTP_REFERENCE_URL}/${encodeURIComponent(slug)}`
}

/** One entry from the docs index endpoint (`/api/openapi`). */
export interface OpenApiSpecIndexEntry {
  description: string
  slug: string
  title: string
}

/**
 * Resolve the docs API base URL. Defaults to production; override with
 * `SANITY_DOCS_API_URL` to point at a preview deployment.
 */
function getDocsApiBaseUrl(): string {
  return process.env.SANITY_DOCS_API_URL || DEFAULT_DOCS_API_URL
}

function buildHeaders(): HeadersInit {
  const token = process.env.SANITY_DOCS_API_BYPASS_TOKEN
  return token ? {'x-vercel-protection-bypass': token} : {}
}

/** Fetch the docs index — one entry per parent spec. */
export async function fetchSpecIndex(): Promise<OpenApiSpecIndexEntry[]> {
  const url = `${getDocsApiBaseUrl()}/api/openapi`
  const response = await fetch(url, {
    headers: buildHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(
      `Docs OpenAPI index endpoint returned ${response.status} ${response.statusText} (${url})`,
    )
  }

  const body = (await response.json()) as {specs?: unknown}
  const rawSpecs = Array.isArray(body.specs) ? body.specs : []

  return rawSpecs.map((raw): OpenApiSpecIndexEntry => {
    const spec = (raw ?? {}) as Record<string, unknown>
    return {
      description: typeof spec.description === 'string' ? spec.description : '',
      slug: typeof spec.slug === 'string' ? spec.slug : '',
      title: typeof spec.title === 'string' ? spec.title : '',
    }
  })
}

/**
 * Fetch a single OpenAPI spec by slug. Always requests YAML — the
 * canonical source-of-truth shape. Returns null on 404; throws on
 * other non-2xx statuses.
 */
export async function fetchSpec(slug: string): Promise<string | null> {
  const url = new URL(`${getDocsApiBaseUrl()}/api/openapi/${encodeURIComponent(slug)}`)
  url.searchParams.set('format', 'yaml')

  const response = await fetch(url, {
    headers: buildHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(
      `Docs OpenAPI per-spec endpoint returned ${response.status} ${response.statusText} (${url})`,
    )
  }

  return await response.text()
}
