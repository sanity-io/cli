import {render, type RenderResult} from 'cli-testing-library'

import {readEnv} from './readEnv.js'
import {resolveBinaryPath} from './resolveBinaryPath.js'

export function getE2EProjectId(): string {
  return readEnv('SANITY_E2E_PROJECT_ID')
}

interface RunCliBaseOptions {
  args?: string[]
  /** Override the binary path. Defaults to E2E_BINARY_PATH (the packed `\@sanity/cli`). */
  binaryPath?: string
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
  const {args = [], binaryPath, cwd, env = {}, interactive = false} = options
  const resolvedBinaryPath = binaryPath ?? resolveBinaryPath()

  const instance = await render('node', [resolvedBinaryPath, ...args], {
    cwd,
    spawnOpts: {
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: '1',
        NODE_ENV: 'production',
        NODE_NO_WARNINGS: '1',
        SANITY_AUTH_TOKEN: readEnv('SANITY_E2E_TOKEN'),
        // Prevent the CLI from reading the user's local auth config
        SANITY_CLI_CONFIG_PATH: '/tmp/nonexistent/config.json',
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
