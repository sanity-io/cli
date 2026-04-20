import * as pty from 'node-pty'
import stripAnsi from 'strip-ansi'
import {onTestFinished} from 'vitest'

import {type KeyName, KEYS} from './keys.js'

const DEFAULT_TIMEOUT = 30_000
const POLL_INTERVAL = 100

export interface InteractiveSession {
  /** All output received so far (merged stream, ANSI codes present) */
  getOutput(): string

  /** Kill the process */
  kill(signal?: string): void

  /** Send Ctrl+<char> (e.g., sendControl('c') for SIGINT) */
  sendControl(char: string): void

  /** Send a named key (maps to escape sequence internally) */
  sendKey(key: KeyName): void

  /** Wait for process exit, returns exit code. Throws on timeout. */
  waitForExit(timeout?: number): Promise<number>

  /** Wait until stripped output matches pattern, or throw after timeout */
  waitForText(pattern: RegExp, opts?: {timeout?: number}): Promise<void>

  /** Write raw text to process stdin */
  write(text: string): void
}

interface SpawnPtyOptions {
  command: string

  args?: string[]
  cwd?: string
  env?: Record<string, string>
}

export function spawnPty({args = [], command, cwd, env}: SpawnPtyOptions): InteractiveSession {
  const ptyProcess = pty.spawn(command, args, {
    cols: 120,
    cwd: cwd ?? process.cwd(),
    env: env as Record<string, string>,
    name: 'xterm-256color',
    rows: 40,
  })

  let output = ''
  let exitResult: {exitCode: number} | null = null
  const exitCallbacks: Array<(exitCode: number) => void> = []

  ptyProcess.onData((data: string) => {
    output += data
  })

  ptyProcess.onExit(({exitCode}) => {
    exitResult = {exitCode}
    for (const cb of exitCallbacks) {
      cb(exitCode)
    }
    exitCallbacks.length = 0
  })

  // Auto-cleanup: kill the PTY when the test finishes if still running
  onTestFinished(() => {
    if (exitResult === null) {
      ptyProcess.kill()
    }
  })

  const session: InteractiveSession = {
    getOutput() {
      return output
    },

    kill(signal?: string) {
      if (exitResult === null) {
        ptyProcess.kill(signal)
      }
    },

    sendControl(char: string) {
      const code = char.toLowerCase().codePointAt(0)! - 96
      ptyProcess.write(String.fromCodePoint(code))
    },

    sendKey(key: KeyName) {
      const sequence = KEYS[key]
      if (!sequence) {
        throw new Error(`Unknown key: ${key}`)
      }
      ptyProcess.write(sequence)
    },

    async waitForExit(timeout = DEFAULT_TIMEOUT): Promise<number> {
      if (exitResult !== null) {
        return exitResult.exitCode
      }

      return new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Process did not exit within ${timeout}ms`))
        }, timeout)

        exitCallbacks.push((exitCode) => {
          clearTimeout(timer)
          resolve(exitCode)
        })
      })
    },

    async waitForText(pattern: RegExp, opts?: {timeout?: number}): Promise<void> {
      const timeout = opts?.timeout ?? DEFAULT_TIMEOUT
      const deadline = Date.now() + timeout

      while (Date.now() < deadline) {
        const stripped = stripAnsi(output)
        if (pattern.test(stripped)) {
          return
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
      }

      const stripped = stripAnsi(output)
      throw new Error(
        `Timed out after ${timeout}ms waiting for pattern ${pattern}\n\nCurrent output:\n${stripped}`,
      )
    },

    write(text: string) {
      ptyProcess.write(text)
    },
  }

  return session
}
