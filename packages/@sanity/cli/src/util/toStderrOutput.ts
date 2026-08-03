import {format} from 'node:util'

import {type Output} from '@sanity/cli-core'

/**
 * An `Output` whose `log` writes to stderr, for `--json` runs where the payload
 * owns stdout and progress logs must not corrupt it. Spinners are already on
 * stderr.
 */
export function toStderrOutput(output: Output): Output {
  return {
    ...output,
    log: (message = '', ...args: unknown[]) =>
      void process.stderr.write(`${format(message, ...args)}\n`),
  }
}
