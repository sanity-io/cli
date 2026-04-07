import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {readEnv} from './readEnv.js'
import {resolveBinaryPath} from './resolveBinaryPath.js'
import {type NonInteractiveResult, spawnProcess} from './spawnProcess.js'
import {type InteractiveSession, spawnPty} from './spawnPty.js'

export function getE2EProjectId(): string {
  return readEnv('SANITY_E2E_PROJECT_ID')
}

interface RunCliBaseOptions {
  args?: string[]
  /** Override the binary path. Defaults to E2E_BINARY_PATH (the packed `@sanity/cli`). */
  binaryPath?: string
  cwd?: string
  env?: Record<string, string>
}

export async function runCli(
  options?: RunCliBaseOptions & {interactive?: false},
): Promise<NonInteractiveResult>

export async function runCli(
  options: RunCliBaseOptions & {interactive: true},
): Promise<InteractiveSession>

export async function runCli(
  options: RunCliBaseOptions & {interactive?: boolean} = {},
): Promise<InteractiveSession | NonInteractiveResult> {
  const {args = [], binaryPath, cwd, env = {}, interactive = false} = options
  const resolvedBinaryPath = binaryPath ?? resolveBinaryPath()

  const sharedEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    // Remove CI so that isInteractive() returns true for PTY-based interactive tests.
    // GitHub Actions sets CI=true, which causes the CLI to throw NonInteractiveError
    // instead of showing prompts.
    ...(interactive ? {CI: ''} : {}),
    NO_UPDATE_NOTIFIER: '1',
    NODE_ENV: 'production',
    NODE_NO_WARNINGS: '1',
    // Temp dirs are outside the workspace, so pnpm won't see the
    // minimumReleaseAgeExclude list from pnpm-workspace.yaml.
    // Disable the check entirely for E2E tests.
    npm_config_minimum_release_age: '0',
    SANITY_AUTH_TOKEN: readEnv('SANITY_E2E_TOKEN'),
    // Prevent the CLI from reading the user's local auth config
    SANITY_CLI_CONFIG_PATH: join(tmpdir(), 'cli-e2e-nonexistent', 'config.json'),
    ...env,
  }

  if (interactive) {
    return spawnPty({
      args: [resolvedBinaryPath, ...args],
      command: 'node',
      cwd,
      env: sharedEnv,
    })
  }

  return spawnProcess({
    args: [resolvedBinaryPath, ...args],
    command: 'node',
    cwd,
    env: sharedEnv,
  })
}
