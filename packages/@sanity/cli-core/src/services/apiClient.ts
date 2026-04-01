import {styleText} from 'node:util'

import {
  type ClientConfig,
  type ClientError,
  createClient,
  requester as defaultRequester,
  isHttpError,
  type SanityClient,
  type ServerError,
} from '@sanity/client'

import {generateHelpUrl} from '../util/generateHelpUrl.js'
import {getCliToken} from './getCliToken.js'

const apiHosts: Record<string, string | undefined> = {
  staging: 'https://api.sanity.work',
}

const CLI_REQUEST_TAG_PREFIX = 'sanity.cli'

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
  requireUser,
  token: providedToken,
  unauthenticated,
  ...config
}: GlobalCliClientOptions): Promise<SanityClient> {
  const requester = defaultRequester.clone()
  requester.use(authErrors())

  const sanityEnv = process.env.SANITY_INTERNAL_ENV || 'production'

  const apiHost = apiHosts[sanityEnv]

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
    requester,
    requestTagPrefix: CLI_REQUEST_TAG_PREFIX,
    token,
    useCdn: false,
    useProjectHostname: false,
    ...config,
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
  requireUser,
  token: providedToken,
  ...config
}: ProjectCliClientOptions): Promise<SanityClient> {
  const requester = defaultRequester.clone()
  requester.use(authErrors())

  const sanityEnv = process.env.SANITY_INTERNAL_ENV || 'production'

  const apiHost = apiHosts[sanityEnv]

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
    requester,
    requestTagPrefix: CLI_REQUEST_TAG_PREFIX,
    token,
    useCdn: false,
    useProjectHostname: true,
    ...config,
  })
}

/**
 * `get-it` middleware that checks for 401 authentication errors and extends the error with more
 * helpful guidance on what to do next.
 *
 * @returns get-it middleware with `onError` handler
 * @internal
 */
function authErrors() {
  return {
    onError: (err: Error | null) => {
      if (!err || !isReqResError(err)) {
        return err
      }

      const statusCode = isHttpError(err) && err.response.body.statusCode
      if (statusCode === 401) {
        err.message = `${err.message}. You may need to login again with ${styleText('cyan', 'sanity login')}.\nFor more information, see ${generateHelpUrl('cli-errors')}.`
      }

      return err
    },
  }
}

function isReqResError(err: Error): err is ClientError | ServerError {
  return Object.prototype.hasOwnProperty.call(err, 'response')
}
