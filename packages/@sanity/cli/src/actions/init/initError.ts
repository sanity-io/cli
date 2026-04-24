export class InitError extends Error {
  exitCode: number
  override name = 'InitError'

  constructor(message: string, exitCode = 1, options?: {cause?: unknown}) {
    super(message, options)
    this.exitCode = exitCode
  }
}
