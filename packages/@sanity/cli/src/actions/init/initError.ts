export class InitError extends Error {
  exitCode: number
  override name = 'InitError'

  constructor(message: string, exitCode = 1) {
    super(message)
    this.exitCode = exitCode
  }
}
