import {getGlobalCliClient} from '@sanity/cli-core'
import {isHttpError} from '@sanity/client'

import {USERS_API_VERSION} from '../../../services/user.js'
import {getErrorMessage} from '../../../util/getErrorMessage.js'

export async function validateToken(token: string): Promise<string> {
  const trimmedToken = token.trim()

  if (!trimmedToken) {
    throw new Error(
      'Token is required on standard input. Run `sanity login --with-token < token.txt`.',
    )
  }

  try {
    await getTokenUser(trimmedToken)
  } catch (error) {
    if (isHttpError(error) && (error.statusCode === 401 || error.statusCode === 403)) {
      throw new Error('Token is invalid or expired. Check the token and try again.', {cause: error})
    }

    throw new Error(`Could not verify token: ${getErrorMessage(error)}`, {cause: error})
  }

  return trimmedToken
}

export async function isSanityApiToken(token: string): Promise<boolean> {
  return isSanityApiTokenUser(await getTokenUser(token))
}

async function getTokenUser(token: string): Promise<unknown> {
  const client = await getGlobalCliClient({
    apiVersion: USERS_API_VERSION,
    requireUser: true,
    token,
  })

  return client.users.getById('me')
}

function isSanityApiTokenUser(user: unknown): boolean {
  return (
    typeof user === 'object' &&
    user !== null &&
    'provider' in user &&
    (user as {provider?: unknown}).provider === 'sanity-token'
  )
}
