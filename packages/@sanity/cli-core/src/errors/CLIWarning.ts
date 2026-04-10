import {styleText} from 'node:util'

import {CLIError} from './CLIError.js'

/**
 * A warning-level CLI error. Identical to {@link CLIError} except the
 * bang prefix is yellow instead of red.
 */
export class CLIWarning extends CLIError {
  constructor(input: Error | string) {
    super(input instanceof Error ? input.message : input)
    this.name = 'Warning'
  }

  override get bang(): string | undefined {
    return styleText('yellow', process.platform === 'win32' ? '»' : '›')
  }
}
