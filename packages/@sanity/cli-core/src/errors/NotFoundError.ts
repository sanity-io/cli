import {isRecord} from '../util/isRecord.js'

/**
 * Error thrown when a file or directory is not found
 *
 * `code` is always `ENOENT` to mirror Node.js behavior when a file is not found
 *
 * @internal
 */
export class NotFoundError extends Error {
  code = 'ENOENT'
  path?: string

  constructor(message: string, path?: string) {
    super(message)
    this.path = path
    this.name = 'NotFoundError'
  }
}

/**
 * Returns whether or not the given error is a `NotFoundError`
 *
 * @param err - The error to check
 * @returns `true` if the error is a `NotFoundError`, `false` otherwise
 * @internal
 */
export function isNotFoundError(err: unknown): err is NotFoundError {
  return (
    isRecord(err) &&
    'name' in err &&
    err.name === 'NotFoundError' &&
    'code' in err &&
    err.code === 'ENOENT' &&
    'message' in err &&
    typeof err.message === 'string'
  )
}
