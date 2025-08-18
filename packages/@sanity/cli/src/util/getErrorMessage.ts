import {isHttpError} from '@sanity/client'

/**
 * Get the error message from an error object
 *
 * @param err - The error object
 * @returns The error message
 * @internal
 */
export function getErrorMessage(err: unknown): string {
  if (isHttpError(err)) {
    const body = err.response.body
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message
    }
    return err.message || 'HTTP error'
  }
  return err instanceof Error ? err.message : 'Unknown error'
}
