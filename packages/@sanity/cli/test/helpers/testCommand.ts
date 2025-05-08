import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {Command, Config, Errors} from '@oclif/core'
import ansis from 'ansis'

type CaptureOptions = {
  /**
   * Whether to print the output to the console
   */
  print?: boolean
  /**
   * Whether to strip ANSI escape codes from the output
   */
  stripAnsi?: boolean
  testNodeEnv?: string
}

type CaptureResult<T = unknown> = {
  error?: Error & Partial<Errors.CLIError>
  result?: T
  stderr: string
  stdout: string
}

/**
 * Capture the output of a command and return the result
 *
 * @param fn - The function to capture the output of
 * @param opts - The options for the capture
 * @returns The result of the command
 * @internal
 *
 * Credits to oclif for the original implementation:
 * https://github.com/oclif/test/blob/2a5407e6fc80d388043d10f6b7b8eaa586483015/src/index.ts
 *
 * We are not using the libary directly since it does not support mocking code inside of the command
 * possibly because the commands run in a different thread
 */
async function captureOutput<T>(
  fn: () => Promise<T>,
  opts?: CaptureOptions,
): Promise<CaptureResult<T>> {
  const print = opts?.print ?? false
  const stripAnsi = opts?.stripAnsi ?? true
  const testNodeEnv = opts?.testNodeEnv || 'test'

  const originals = {
    NODE_ENV: process.env.NODE_ENV,
    stderrWrite: process.stderr.write,
    stdoutWrite: process.stdout.write,
  }

  const output: Record<'stderr' | 'stdout', string[]> = {
    stderr: [],
    stdout: [],
  }

  const toString = (str: string | Uint8Array): string =>
    stripAnsi ? ansis.strip(str.toString()) : str.toString()

  const getStderr = (): string => output.stderr.map((b) => toString(b)).join('')
  const getStdout = (): string => output.stdout.map((b) => toString(b)).join('')

  const mockWrite =
    (std: 'stderr' | 'stdout'): typeof process.stderr.write =>
    (
      chunk: string | Uint8Array,
      encodingOrCb?: ((err?: Error) => void) | BufferEncoding,
      cb?: (err?: Error) => void,
    ) => {
      output[std].push(chunk.toString())

      if (print) {
        let callback: ((err?: Error) => void) | undefined = cb
        let encoding: BufferEncoding | undefined
        if (typeof encodingOrCb === 'function') {
          callback = encodingOrCb
        } else {
          encoding = encodingOrCb
        }
        originals[`${std}Write`].apply(process[std], [chunk, encoding, callback])
      } else if (typeof cb === 'function') {
        cb()
      } else if (typeof encodingOrCb === 'function') {
        encodingOrCb()
      }
      return true
    }

  process.stdout.write = mockWrite('stdout')
  process.stderr.write = mockWrite('stderr')
  process.env.NODE_ENV = testNodeEnv

  try {
    const result = await fn()
    return {
      result,
      stderr: getStderr(),
      stdout: getStdout(),
    }
  } catch (error) {
    // Check if it's an oclif CLIError or a regular error
    const processedError =
      error instanceof Error // Check if it's an Error (this includes CLIError)
        ? Object.assign(error, {message: toString(error.message)}) // If so, process its message
        : new Error(toString(String(error))) // Otherwise, create a new Error from string representation

    return {
      error: processedError,
      stderr: getStderr(),
      stdout: getStdout(),
    }
  } finally {
    process.stdout.write = originals.stdoutWrite
    process.stderr.write = originals.stderrWrite
    process.env.NODE_ENV = originals.NODE_ENV
  }
}

export async function testCommand(
  command: (new (argv: string[], config: Config) => Command) & typeof Command,
  args?: string[],
  options?: {capture?: CaptureOptions; config?: Partial<Config>},
): Promise<CaptureResult<unknown>> {
  const commandInstancePromise = () =>
    command.run(args || [], {
      root: path.resolve(fileURLToPath(import.meta.url), '../../../'),
      ...options?.config,
    })

  return captureOutput(commandInstancePromise, options?.capture)
}
