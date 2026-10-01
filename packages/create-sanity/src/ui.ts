import {styleText} from 'node:util'

import * as inquirer from '@inquirer/prompts'
import ora, {type Ora} from 'ora'

export {Separator} from '@inquirer/prompts'

/** Exit codes shared with `sanity` */
export const exitCodes = {RUNTIME_ERROR: 1, SIGINT: 130, USAGE_ERROR: 2} as const

/** An error that ends initialization with the given exit code and message */
export class InitError extends Error {
  exitCode: number

  constructor(message: string, exitCode: number = exitCodes.RUNTIME_ERROR) {
    super(message)
    this.name = 'InitError'
    this.exitCode = exitCode
  }
}

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && process.env.TERM !== 'dumb' && !('CI' in process.env)
}

export const output = {
  log(message = ''): void {
    process.stdout.write(`${message}\n`)
  },
  warn(message: string): void {
    process.stderr.write(`${styleText('yellow', '›')}   Warning: ${message}\n`)
  },
}

/**
 * Ora's default `discardStdin` puts stdin in raw mode, which stops Ctrl+C from
 * becoming SIGINT and can hang the process, so it is off.
 */
export function spinner(text: string): Ora {
  return ora({discardStdin: false, stream: process.stderr, text})
}

function assertInteractive(promptName: string): void {
  if (!isInteractive()) {
    throw new InitError(
      `Cannot run "${promptName}" prompt in a non-interactive environment. Pass the value as a flag instead.`,
      exitCodes.USAGE_ERROR,
    )
  }
}

export const confirm: typeof inquirer.confirm = (...args) => {
  assertInteractive('confirm')
  return inquirer.confirm(...args)
}

export const input: typeof inquirer.input = (...args) => {
  assertInteractive('input')
  return inquirer.input(...args)
}

export const select: typeof inquirer.select = (...args) => {
  assertInteractive('select')
  return inquirer.select(...args)
}

export {default as logSymbols} from 'log-symbols'
