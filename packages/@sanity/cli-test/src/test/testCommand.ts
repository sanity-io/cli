import {fileURLToPath} from 'node:url'

import {Command, Config} from '@oclif/core'

import {type CaptureOptions, captureOutput, type CaptureResult} from './captureOutput.js'
import {mockSanityCommand, type MockSanityCommandOptions} from './mockSanityCommand.js'

type CommandClass = (new (argv: string[], config: Config) => Command) & typeof Command

/**
 * @public
 */
export interface TestCommandOptions {
  /**
   * Options for capturing output
   */
  capture?: CaptureOptions
  /**
   * Partial oclif config overrides
   */
  config?: Partial<Config>
  /**
   * Mock options for SanityCommand dependencies (config, project root, API clients).
   * When provided, the command is automatically wrapped with mockSanityCommand.
   */
  mocks?: MockSanityCommandOptions
}

/**
 * @public
 */
export async function testCommand(
  command: CommandClass,
  args?: string[],
  options?: TestCommandOptions,
): Promise<CaptureResult<unknown>> {
  // If mocks provided, wrap the command with mockSanityCommand
  const CommandToRun = options?.mocks
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockSanityCommand(command as any, options.mocks) as CommandClass)
    : command

  const commandInstancePromise = () =>
    CommandToRun.run(args || [], {
      root: fileURLToPath(import.meta.url),
      ...options?.config,
    })

  return captureOutput(commandInstancePromise, options?.capture)
}
