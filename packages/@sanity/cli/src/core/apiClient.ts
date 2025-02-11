import {ux} from '@oclif/core'
import {
  type ClientError,
  createClient,
  requester as defaultRequester,
  type SanityClient,
  type ServerError,
} from '@sanity/client'

import {generateHelpUrl} from '../util/generateHelpUrl.js'
import {isHttpError} from '../util/isHttpError.js'
import {getCliToken} from './cliToken.js'

const apiHosts: Record<string, string | undefined> = {
  staging: 'https://api.sanity.work',
}

/**
 * @internal
 */
export interface GlobalCliClientOptions {
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
}

/**
 * Create a "global" (unscoped) Sanity API client.
 *
 * @param options - The options to use for the client.
 * @returns Promise that resolves to a configured Sanity API client.
 */
export async function getGlobalCliClient({
  apiVersion,
  requireUser,
}: GlobalCliClientOptions): Promise<SanityClient> {
  const requester = defaultRequester.clone()
  requester.use(authErrors())

  const sanityEnv = process.env.SANITY_INTERNAL_ENV || 'production'

  const token = await getCliToken()
  const apiHost = apiHosts[sanityEnv]

  if (requireUser && !token) {
    throw new Error('You must login first - run "sanity login"')
  }

  return createClient({
    ...(apiHost ? {apiHost} : {}),
    apiVersion,
    requester,
    requestTagPrefix: 'sanity.cli',
    token,
    useCdn: false,
    useProjectHostname: false,
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
        err.message = `${err.message}. You may need to login again with ${ux.colorize('cyan', 'sanity login')}.\nFor more information, see ${generateHelpUrl('cli-errors')}.`
      }

      return err
    },
  }
}

function isReqResError(err: Error): err is ClientError | ServerError {
  return Object.prototype.hasOwnProperty.call(err, 'response')
}
