/**
 * Error thrown when a prompt is attempted in a non-interactive environment
 * (e.g., CI, non-TTY, piped stdin). Callers can catch this specific error
 * to provide appropriate fallback behavior.
 */
export class NonInteractiveError extends Error {
  constructor(promptName: string) {
    super(
      `Cannot run "${promptName}" prompt in a non-interactive environment. ` +
        'Provide the required value via flags or environment variables, or run in an interactive terminal.',
    )
    this.name = 'NonInteractiveError'
  }
}
