import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {Command, Config} from '@oclif/core'

export function testCommand(
  command: (new (argv: string[], config: Config) => Command) & typeof Command,
  args?: string[],
  config?: Config,
) {
  return command.run(args || [], {
    root: path.resolve(fileURLToPath(import.meta.url), '../../../'),
    ...config,
  })
}
