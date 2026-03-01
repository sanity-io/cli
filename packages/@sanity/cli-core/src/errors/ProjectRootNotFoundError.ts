import {CLIError} from '@oclif/core/errors'

import {isRecord} from '../util/isRecord.js'

/**
 * Error thrown when a project root directory cannot be found.
 *
 * This occurs when the CLI is run outside a Sanity project directory
 * (one containing `sanity.config.(ts|js)` or `sanity.cli.(ts|js)`).
 *
 * Extends `CLIError` to suppress stack traces in user-facing output.
 *
 * @internal
 */
export class ProjectRootNotFoundError extends CLIError {
  constructor(message: string, options?: {cause?: Error; suggestions?: string[]}) {
    super(message, {code: 'PROJECT_ROOT_NOT_FOUND', exit: 1, suggestions: options?.suggestions})
    this.name = 'ProjectRootNotFoundError'
    if (options?.cause) {
      this.cause = options.cause
    }
  }
}

/**
 * Returns whether or not the given error is a `ProjectRootNotFoundError`
 *
 * @param err - The error to check
 * @returns `true` if the error is a `ProjectRootNotFoundError`, `false` otherwise
 * @internal
 */
export function isProjectRootNotFoundError(err: unknown): err is ProjectRootNotFoundError {
  return (
    isRecord(err) &&
    'name' in err &&
    err.name === 'ProjectRootNotFoundError' &&
    'code' in err &&
    err.code === 'PROJECT_ROOT_NOT_FOUND' &&
    'message' in err &&
    typeof err.message === 'string'
  )
}
