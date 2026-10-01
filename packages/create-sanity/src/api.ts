import {getToken} from './config.js'

export const isStaging = () => process.env.SANITY_INTERNAL_ENV === 'staging'

/** Mirrors `@sanity/client` errors closely enough for callers to branch on status */
export class ApiError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
  }
}

export interface RequestOptions {
  apiVersion: string
  url: string

  body?: unknown
  method?: string
  /** Use `<projectId>.api.sanity.io` instead of the global API host */
  projectId?: string
  query?: Record<string, string>
  /** Explicit token; defaults to the stored CLI token */
  token?: string
  unauthenticated?: boolean
}

/** Absolute API URL, as `@sanity/client` builds it for the CLI */
export function apiUrl({apiVersion, projectId, query, url}: RequestOptions): string {
  const base = isStaging() ? 'api.sanity.work' : 'api.sanity.io'
  const host = projectId ? `${projectId}.${base}` : base
  const version = apiVersion.startsWith('v') ? apiVersion : `v${apiVersion}`
  const target = new URL(`https://${host}/${version}${url}`)
  for (const [key, value] of Object.entries(query ?? {})) target.searchParams.set(key, value)
  target.searchParams.set('tag', 'sanity.cli')
  return target.href
}

function errorMessage(statusCode: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    const error = record.error
    if (error && typeof error === 'object') {
      const description = (error as Record<string, unknown>).description
      if (typeof description === 'string') return description
    }
    if (typeof record.message === 'string') return record.message
    if (typeof error === 'string') return error
  }
  return `Request failed with status code ${statusCode}`
}

export async function request<T>(options: RequestOptions): Promise<T> {
  const token = options.unauthenticated ? undefined : (options.token ?? getToken())
  if (!token && !options.unauthenticated) {
    throw new Error('You must login first - run "sanity login"')
  }
  const headers: Record<string, string> = {accept: 'application/json'}
  if (token) headers.authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['content-type'] = 'application/json'

  const response = await fetch(apiUrl(options), {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method ?? 'GET',
  })
  const text = await response.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    // keep the raw text
  }
  if (!response.ok) throw new ApiError(response.status, errorMessage(response.status, body))
  return body as T
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403)
}
