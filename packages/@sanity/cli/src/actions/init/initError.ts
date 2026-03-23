/**
 * Error thrown by initAction when the init flow should terminate with an error.
 * The caller decides how to handle it - eg InitCommand (oclif) catches
 * and translates to oclif's error/exit semantics.
 */
export class InitError extends Error {
  exitCode: number
  override name = 'InitError'

  constructor(message: string, exitCode = 1, options?: {cause?: unknown}) {
    super(message, options)
    this.exitCode = exitCode
  }
}
