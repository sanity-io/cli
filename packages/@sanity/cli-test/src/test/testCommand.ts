import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {Command, Config} from '@oclif/core'

import {type CaptureOptions, captureOutput, type CaptureResult} from './captureOutput.js'

export async function testCommand(
  command: (new (argv: string[], config: Config) => Command) & typeof Command,
  args?: string[],
  options?: {capture?: CaptureOptions; config?: Partial<Config>},
): Promise<CaptureResult<unknown>> {
  const commandInstancePromise = () =>
    command.run(args || [], {
      root: path.resolve(fileURLToPath(import.meta.url), '../../../../cli'),
      ...options?.config,
    })

  return captureOutput(commandInstancePromise, options?.capture)
}
