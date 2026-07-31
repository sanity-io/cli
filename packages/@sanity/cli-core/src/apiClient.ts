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

import {getCliToken} from './config/cli/cliUserConfig.js'
import {generateHelpUrl} from './util/generateHelpUrl.js'
import {getSanityUrl} from './util/getSanityUrl.js'
import {isStaging} from './util/isStaging.js'

const STAGING_API_HOST = 'https://api.sanity.work'

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
  requester.use(authErrors(config.projectId))

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
function authErrors(projectId?: string) {
  return {
    onError: (err: Error | null) => {
      if (!err || !isReqResError(err)) {
        return err
      }

      const statusCode = isHttpError(err) && err.statusCode
      if (statusCode === 401) {
        if (isProjectUserNotFoundError(err)) {
          const inviteCommand = styleText(
            'cyan',
            `sanity users invite <email> --project-id ${projectId ?? '<project-id>'} --role <role>`,
          )
          const membersUrl = projectId
            ? getSanityUrl(`/manage/project/${encodeURIComponent(projectId)}/members`)
            : getSanityUrl('/manage')
          err.message = `${err.message}. This account is not a member of the project. Organization-level roles do not grant access to project content. Invite this account with ${inviteCommand} or add it as a project member at ${membersUrl}.`
          return err
        }

        err.message = `${err.message}. You may need to login again with ${styleText('cyan', 'sanity login')}.\nFor more information, see ${generateHelpUrl('cli-errors')}.`
      }

      return err
    },
  }
}

// Detection fallback for Content Lake responses that carry the
// missing-membership 401 only as prose. Anchored to the full sentence so
// unrelated 401s can't trigger; if the wording ever changes, detection
// degrades to the generic 401 guidance above rather than misfiring.
const PROJECT_USER_NOT_FOUND_MESSAGE =
  /\bproject user not found for user ID "[^"]*" in project "[a-zA-Z0-9-]+"/

function isProjectUserNotFoundError(err: ClientError | ServerError): boolean {
  return (
    isProjectUserNotFoundErrorBody(err.response.body) ||
    PROJECT_USER_NOT_FOUND_MESSAGE.test(err.message)
  )
}

function isProjectUserNotFoundErrorBody(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false

  const {error} = body
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'projectUserNotFoundError'
  )
}

function isReqResError(err: Error): err is ClientError | ServerError {
  return Object.prototype.hasOwnProperty.call(err, 'response')
}
