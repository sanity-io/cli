import {
  type ClientConfig,
  createClient,
  type RequestHandler,
  type SanityClient,
} from '@sanity/client'
import {type FetchFunction} from 'get-it'
import {createNodeFetch} from 'get-it/node'

import {getCliToken} from './config/cli/cliUserConfig.js'
import {enrichAuthError} from './errors/enrichAuthError.js'
import {type CliExecutionContext, getCliExecutionContext} from './executionContext.js'
import {isStaging} from './util/isStaging.js'

const STAGING_API_HOST = 'https://api.sanity.work'

const CLI_REQUEST_TAG_PREFIX = 'sanity.cli'

// One default transport per proxy URL, mirroring the client's own
// environment resolver.
const defaultBaseFetchCache = new Map<string, FetchFunction>()

function defaultBaseFetch(proxyUrl?: string): FetchFunction {
  const key = proxyUrl ?? ''
  const cached = defaultBaseFetchCache.get(key)
  if (cached) return cached

  const base = createNodeFetch(proxyUrl ? {connections: 30, proxy: proxyUrl} : undefined)
  defaultBaseFetchCache.set(key, base)
  return base
}

/**
 * Build the transport resolver for clients created inside a CLI execution
 * context.
 *
 * Uses the context's own fetch when the embedding host supplies one,
 * otherwise the client's default Node transport (get-it's undici-backed,
 * proxy-aware fetch). Either way the transport strips the
 * `x-sanity-lineage` header the client's Node middleware adds from
 * `X_SANITY_LINEAGE` — that variable belongs to the embedding process, not
 * to this CLI invocation. Note that unlike the client v7 isolated requester,
 * the client's `sanity:client` debug logging cannot be detached per-client
 * in v8, so a host `DEBUG` setting still applies to it.
 */
function isolatedFetchResolver(context: CliExecutionContext): (proxyUrl?: string) => FetchFunction {
  return (proxyUrl) => {
    const base = context.fetch ?? defaultBaseFetch(proxyUrl)
    return (url, init) => {
      const headers = new Headers(init?.headers)
      headers.delete('x-sanity-lineage')
      return base(url, {...init, headers})
    }
  }
}

const authErrorHandler: RequestHandler = async (request, next) => {
  try {
    return await next(request)
  } catch (error) {
    throw enrichAuthError(error)
  }
}

/**
 * Add the CLI's authentication guidance inside any caller-provided request
 * handler. This lets the caller observe enriched client errors while
 * preserving its control over the request and response pipeline.
 */
function withAuthErrorHints(requestHandler?: RequestHandler): RequestHandler {
  if (!requestHandler) return authErrorHandler

  return (request, next) =>
    requestHandler(request, (nextRequest) => authErrorHandler(nextRequest, next))
}

/**
 * @public
 */
export interface GlobalCliClientOptions extends ClientConfig {
  /**
   * The API version to use for this client.
   */
  apiVersion: string

  /**
   * Whether to require a user to be authenticated to use this client.
   * Default: `false`.
   * Throws an error if `true` and user is not authenticated.
   */
  requireUser?: boolean

  /**
   * Whether to skip reading the stored CLI token. When `true`, the client will
   * have no token unless one is explicitly provided.
   * Default: `false`.
   */
  unauthenticated?: boolean
}

/**
 * Create a "global" (unscoped) Sanity API client.
 *
 * @public
 *
 * @param options - The options to use for the client.
 * @returns Promise that resolves to a configured Sanity API client.
 */
export async function getGlobalCliClient({
  requestHandler,
  requireUser,
  token: providedToken,
  unauthenticated,
  ...config
}: GlobalCliClientOptions): Promise<SanityClient> {
  const context = getCliExecutionContext()

  const apiHost = isStaging() ? STAGING_API_HOST : undefined

  // Use the provided token if set, otherwise fall back to the stored CLI token (unless unauthenticated)
  const token = providedToken || (unauthenticated ? undefined : await getCliToken())

  // If the token is not set and requireUser is true, throw an error
  if (!token && requireUser) {
    throw new Error('You must login first - run "sanity login"')
  }

  return createClient({
    ...(apiHost ? {apiHost} : {}),
    // Suppress browser token warning since we mock browser environment in workers
    ignoreBrowserTokenWarning: true,
    ...(context ? {resolveFetch: isolatedFetchResolver(context)} : {}),
    requestTagPrefix: CLI_REQUEST_TAG_PREFIX,
    token,
    useCdn: false,
    useProjectHostname: false,
    ...config,
    requestHandler: withAuthErrorHints(requestHandler),
  })
}

/**
 * @public
 */
export interface ProjectCliClientOptions extends ClientConfig {
  /**
   * The API version to use for this client.
   */
  apiVersion: string

  /**
   * The project ID to use for this client.
   */
  projectId: string

  /**
   * The dataset to use for this client.
   */
  dataset?: string

  /**
   * Whether to require a user to be authenticated to use this client.
   * Default: `false`.
   * Throws an error if `true` and user is not authenticated.
   */
  requireUser?: boolean
}

/**
 * Create a "project" (scoped) Sanity API client.
 *
 * @public
 *
 * @param options - The options to use for the client.
 * @returns Promise that resolves to a configured Sanity API client.
 */
export async function getProjectCliClient({
  requestHandler,
  requireUser,
  token: providedToken,
  ...config
}: ProjectCliClientOptions): Promise<SanityClient> {
  const context = getCliExecutionContext()

  const apiHost = isStaging() ? STAGING_API_HOST : undefined

  // Use the provided token if it is set, otherwise get the token from the config file
  const token = providedToken || (await getCliToken())

  // If the token is not set and requireUser is true, throw an error
  if (!token && requireUser) {
    throw new Error('You must login first - run "sanity login"')
  }

  return createClient({
    ...(apiHost ? {apiHost} : {}),
    // Suppress browser token warning since we mock browser environment in workers
    ignoreBrowserTokenWarning: true,
    ...(context ? {resolveFetch: isolatedFetchResolver(context)} : {}),
    requestTagPrefix: CLI_REQUEST_TAG_PREFIX,
    token,
    useCdn: false,
    useProjectHostname: true,
    ...config,
    requestHandler: withAuthErrorHints(requestHandler),
  })
}
