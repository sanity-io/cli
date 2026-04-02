import {render, type RenderResult} from 'cli-testing-library'

import {readEnv} from './readEnv.js'
import {resolveBinaryPath} from './resolveBinaryPath.js'

export const E2E_PROJECT_ID: string = readEnv('SANITY_E2E_PROJECT_ID')

interface RunCliBaseOptions {
  args?: string[]
  cwd?: string
  env?: Record<string, string>
}

interface NonInteractiveResult {
  exitCode: number
  stderr: string
  stdout: string

  error?: Error
}

export async function runCli(
  options?: RunCliBaseOptions & {interactive?: false},
): Promise<NonInteractiveResult>

export async function runCli(
  options: RunCliBaseOptions & {interactive: true},
): Promise<RenderResult>

export async function runCli(
  options: RunCliBaseOptions & {interactive?: boolean} = {},
): Promise<NonInteractiveResult | RenderResult> {
  const {args = [], cwd, env = {}, interactive = false} = options
  const binaryPath = resolveBinaryPath()

  const instance = await render('node', [binaryPath, ...args], {
    cwd,
    spawnOpts: {
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: '1',
        NODE_ENV: 'production',
        NODE_NO_WARNINGS: '1',
        SANITY_AUTH_TOKEN: readEnv('SANITY_E2E_TOKEN'),
        ...env,
      },
    },
  })

  if (interactive) {
    return instance
  }

  // Register the close listener before checking hasExit() to avoid a race
  // where the process exits between the check and listener registration.
  const exitCode = await new Promise<number>((resolve) => {
    instance.process.on('close', (code) => {
      resolve(code ?? 1)
    })
    const exit = instance.hasExit()
    if (exit !== null) {
      resolve(exit.exitCode)
    }
  })

  const stdout = instance.stdoutArr.map((entry) => String(entry.contents)).join('')
  const stderr = instance.stderrArr.map((entry) => String(entry.contents)).join('')

  return {
    error: exitCode === 0 ? undefined : new Error(stderr || `CLI exited with code ${exitCode}`),
    exitCode,
    stderr,
    stdout,
  }
}
