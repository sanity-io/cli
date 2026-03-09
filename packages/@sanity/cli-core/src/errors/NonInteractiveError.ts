import {CLIError} from '@oclif/core/errors'

/**
 * Error thrown when a prompt is attempted in a non-interactive environment
 * (e.g., CI, non-TTY, piped stdin). Callers can catch this specific error
 * to provide appropriate fallback behavior.
 *
 * Extends `CLIError` to suppress stack traces in user-facing output.
 */
export class NonInteractiveError extends CLIError {
  constructor(promptName: string) {
    super(
      `Cannot run "${promptName}" prompt in a non-interactive environment. ` +
        'Provide the required value via flags or environment variables, or run in an interactive terminal.',
      {code: 'NON_INTERACTIVE', exit: 1},
    )
    this.name = 'NonInteractiveError'
  }
}
