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

  /**
   * Navigate to the option matching `pattern` in an active select prompt and press Enter.
   * Waits for options to render, verifies exactly one match exists, then iterates
   * ArrowDown until the ❯ cursor is on the matching line and confirms with Enter.
   * Throws if zero or multiple options match.
   */
  selectOption(pattern: RegExp | string, opts?: {timeout?: number}): Promise<void>

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

    async selectOption(pattern: RegExp | string, opts?: {timeout?: number}): Promise<void> {
      const timeout = opts?.timeout ?? DEFAULT_TIMEOUT
      const deadline = Date.now() + timeout
      const regex =
        pattern instanceof RegExp
          ? pattern
          : new RegExp(pattern.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))

      // Navigate ArrowDown until ❯ is on a line matching the pattern.
      // The option may be off-screen and require scrolling, so we can't
      // wait for it to appear before navigating.
      const seenOptions = new Set<string>()
      while (Date.now() < deadline) {
        const current = stripAnsi(output)
        const selectedLine = current.split('\n').findLast((line) => line.includes('❯'))

        if (selectedLine && regex.test(selectedLine)) {
          // Before confirming, check that only one distinct option matches
          const allOptionLines = current
            .split('\n')
            .filter((line) => /^\s*[❯ ]\s+\S/.test(line))
            .map((line) => line.replace(/^\s*❯?\s*/, '').trim())
          const matchingOptions = [...new Set(allOptionLines.filter((line) => regex.test(line)))]
          if (matchingOptions.length > 1) {
            throw new Error(
              `Multiple options match ${regex} — must match exactly one\n\nMatches:\n${matchingOptions.join('\n')}`,
            )
          }

          ptyProcess.write(KEYS.Enter)
          return
        }

        // Track seen options to detect when we've wrapped around the full list
        if (selectedLine) {
          const optionText = selectedLine.replace(/^\s*❯?\s*/, '').trim()
          if (seenOptions.has(optionText) && seenOptions.size > 1) {
            throw new Error(
              `Option matching ${regex} not found after scrolling through all options\n\nSeen options:\n${[...seenOptions].join('\n')}`,
            )
          }
          seenOptions.add(optionText)
        }

        ptyProcess.write(KEYS.ArrowDown)
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
      }

      throw new Error(
        `Timed out navigating to option matching ${regex}\n\nSeen options:\n${[...seenOptions].join('\n')}`,
      )
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
