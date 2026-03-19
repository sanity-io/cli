/**
 * Error thrown by initAction when the init flow should terminate.
 * Callers decide how to handle it:
 * - InitCommand (oclif) catches and calls this.error(msg, {exit})
 * - Standalone create-sanity catches, logs, and calls process.exit()
 */
export class InitError extends Error {
  exitCode: number
  override name = 'InitError'

  constructor(message: string, exitCode = 1) {
    super(message)
    this.exitCode = exitCode
  }
}
