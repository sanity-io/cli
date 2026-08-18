import {styleText} from 'node:util'

import {isHttpError} from '@sanity/client'

import {generateHelpUrl} from '../util/generateHelpUrl.js'
import {getSanityUrl} from '../util/getSanityUrl.js'

const enrichedErrors = new WeakSet<object>()

/**
 * Append login/membership guidance to 401 API errors.
 *
 * Replaces the `onError` requester middleware used with client v7. The client
 * request handler applies the hint after errors have been normalized. Mutates
 * the error message (matching the old middleware behavior) and is idempotent.
 *
 * @param err - The error to enrich
 * @returns The same error, with an enriched message when it is a 401
 * @internal
 */
export function enrichAuthError<T>(err: T): T {
  if (typeof err !== 'object' || err === null || enrichedErrors.has(err)) return err
  if (!isHttpError(err) || err.statusCode !== 401) return err
  enrichedErrors.add(err)

  const projectId = projectIdFromUrl(err.response.url)
  if (projectId && isProjectUserNotFoundError(err.response.body)) {
    err.message = `${err.message}. Add this account as a project member: ${getSanityUrl(`/manage/project/${encodeURIComponent(projectId)}/members`)}.`
    return err
  }

  err.message = `${err.message}. You may need to login again with ${styleText('cyan', 'sanity login')}.\nFor more information, see ${generateHelpUrl('cli-errors')}.`
  return err
}

/**
 * Derive the project ID from a project-hostname API URL
 * (`<projectId>.api.sanity.io` or `.work`). Global-host requests return
 * `undefined`, mirroring the old middleware which only knew the project ID
 * for project-scoped clients.
 */
function projectIdFromUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined
  try {
    const host = new URL(url).hostname
    return /^([a-z0-9-]+)\.api\.sanity\.(?:io|work)$/.exec(host)?.[1]
  } catch {
    return undefined
  }
}

function isProjectUserNotFoundError(
  body: unknown,
): body is {error: {type: 'projectUserNotFoundError'}} {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false

  const {error} = body
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'projectUserNotFoundError'
  )
}
