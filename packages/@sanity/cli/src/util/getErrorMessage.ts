import {isHttpError} from '@sanity/client'

/**
 * Coerce an unknown thrown value into an Error instance.
 *
 * @param value - The thrown value
 * @returns An Error instance (the original if already an Error, otherwise a new one)
 * @internal
 */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

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
