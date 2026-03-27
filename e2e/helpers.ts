import path from 'node:path'
import {fileURLToPath} from 'node:url'

import pty from 'node-pty'

const SANITY_BIN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages/@sanity/cli/bin/run.js',
)

/* eslint-disable no-control-regex */
const strip = (s: string) =>
  s.replaceAll(/\u001B\[[0-9;?]*[a-zA-Z]/g, '').replaceAll(/\u001B[()][AB012]/g, '')
/* eslint-enable no-control-regex */

const matches = (input: Input, plain: string) =>
  typeof input.waitFor === 'string' ? plain.includes(input.waitFor) : input.waitFor.test(plain)

export interface Input {
  /** Keystrokes to write to the terminal once waitFor matches. */
  send: string
  /** Wait for this string/pattern to appear in accumulated output before sending. */
  waitFor: RegExp | string

  /**
   * If true, keep sending on every data event until the next input's waitFor matches.
   * Useful for scrolling a list to bring an off-screen item into view.
   */
  repeat?: boolean
}

export interface RunResult {
  exitCode: number
  /** Raw terminal output exactly as a user would see it. */
  output: string
}

export interface RunOptions {
  cwd?: string
  env?: Record<string, string>
  /** Interactive inputs to send in response to prompts, processed in order. */
  inputs?: Input[]
  timeout?: number
  /** Stream raw terminal output to stdout as it arrives. */
  verbose?: boolean
}

export async function sanity(args: string[], options: RunOptions = {}): Promise<RunResult> {
  const {cwd = process.cwd(), env = {}, inputs = [], timeout = 30_000, verbose = false} = options

  return new Promise((resolve, reject) => {
    const term = pty.spawn('node', [SANITY_BIN, ...args], {
      cols: 120,
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        // Prevent oclif from trying to resolve TypeScript source files — it only
        // does this in non-production envs, and vitest sets NODE_ENV=test which
        // triggers it, causing "Could not find source" warnings on every run.
        NODE_ENV: 'production',
        ...env,
        // Strip colour codes so assertions can match plain text
        NO_COLOR: '1',
      },
      name: 'xterm-color',
      rows: 30,
    })

    let output = ''
    const pending = [...inputs]
    let repeatInterval: ReturnType<typeof setInterval> | null = null

    const clearRepeat = () => {
      if (repeatInterval) {
        clearInterval(repeatInterval)
        repeatInterval = null
      }
    }

    const timer = setTimeout(() => {
      clearRepeat()
      term.kill()
      reject(new Error(`Timed out after ${timeout}ms\n\nOutput so far:\n${output}`))
    }, timeout)

    term.onData((data) => {
      if (verbose) process.stdout.write(data)
      output += data

      // Repeat inputs are driven by their own interval, not by onData
      if (pending.length === 0 || repeatInterval) return

      const plain = strip(output)
      const current = pending[0]

      if (!matches(current, plain)) return

      if (current.repeat && pending.length > 1) {
        // Start an interval that scrolls until the next input's condition is met
        repeatInterval = setInterval(() => {
          const p = strip(output)
          if (matches(pending[1], p)) {
            clearRepeat()
            pending.shift()
            term.write(pending[0].send)
            pending.shift()
          } else {
            term.write(current.send)
          }
        }, 50)
      } else {
        pending.shift()
        term.write(current.send)
      }
    })

    term.onExit(({exitCode}) => {
      clearRepeat()
      clearTimeout(timer)
      resolve({exitCode, output})
    })
  })
}
