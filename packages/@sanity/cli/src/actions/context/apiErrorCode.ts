import {isHttpError} from '@sanity/client'

/**
 * The Context API's error `code` (such as `sourceDeletionsUnconfirmed`) from a
 * failed request, if it has one
 */
export function apiErrorCode(error: unknown): string | undefined {
  if (!isHttpError(error)) return undefined
  const body: unknown = error.response.body
  if (typeof body !== 'object' || body === null || !('code' in body)) return undefined
  return typeof body.code === 'string' ? body.code : undefined
}
