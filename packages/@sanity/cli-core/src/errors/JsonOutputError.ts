import {CLIError} from '@oclif/core/errors'

/** A command failure with an existing JSON response or diagnostic report. */
export class JsonOutputError extends CLIError {
  public readonly payload: unknown

  constructor(message: string, payload: unknown, exit: number) {
    super(message, {exit})
    this.payload = payload
  }
}
