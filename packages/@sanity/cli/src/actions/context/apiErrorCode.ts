import {isHttpError} from '@sanity/client'

function errorBody(error: unknown): object | undefined {
  if (!isHttpError(error)) return undefined
  const body: unknown = error.response.body
  return typeof body === 'object' && body !== null ? body : undefined
}

/**
 * The Context API's error `code` (such as `sourceDeletionsUnconfirmed`) from a
 * failed request, if it has one
 */
export function apiErrorCode(error: unknown): string | undefined {
  const body = errorBody(error)
  if (!body || !('code' in body)) return undefined
  return typeof body.code === 'string' ? body.code : undefined
}

/**
 * A number from the `fields` of a Context API error (such as `deletions` on a
 * `sourceDeletionsUnconfirmed` error), if it has one
 */
export function apiErrorNumberField(error: unknown, name: string): number | undefined {
  const body = errorBody(error)
  if (!body || !('fields' in body)) return undefined
  const {fields} = body
  if (typeof fields !== 'object' || fields === null) return undefined
  const value: unknown = Object.entries(fields).find(([key]) => key === name)?.[1]
  return typeof value === 'number' ? value : undefined
}
