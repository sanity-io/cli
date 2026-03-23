import {styleText} from 'node:util'

import {type PrettyPrintableError} from '@oclif/core/interfaces'
import cleanStack from 'clean-stack'

/**
 * A formatted CLI error that pretty-prints to stderr.
 *
 * This is a lightweight reimplementation of `@oclif/core`'s `CLIError`.
 * We can't import the original because `@oclif/core` is a CJS barrel that
 * pulls in the entire oclif runtime (~10MB) when bundled - defeating
 * tree-shaking in the standalone `create-sanity` bundle. By owning the
 * error class here, code in `@sanity/cli-core` and the init action tree
 * can throw formatted errors without depending on oclif at all.
 *
 * The `oclif` property is shaped so oclif's error handler still recognises
 * these errors when thrown inside an oclif command, preserving the correct
 * exit code and suppressing redundant stack traces.
 */
export class CLIError extends Error {
  code?: string
  oclif: {exit?: number} = {exit: 2}
  ref?: string
  skipOclifErrorHandling?: boolean
  suggestions?: string[]

  constructor(error: Error | string, options: PrettyPrintableError & {exit?: false | number} = {}) {
    super(error instanceof Error ? error.message : error)
    if (error instanceof Error && error.stack) {
      this.stack = error.stack
    }
    if (options.exit !== undefined)
      this.oclif.exit = options.exit === false ? undefined : options.exit
    this.code = options.code
    this.suggestions = options.suggestions
    this.ref = options.ref
  }

  get bang(): string | undefined {
    return styleText('red', process.platform === 'win32' ? '»' : '›')
  }

  get prettyStack(): string {
    return cleanStack(super.stack!, {pretty: true})
  }
}
