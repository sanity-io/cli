import {spawn} from 'node:child_process'
import {join} from 'node:path'

import {describe, expect, test} from 'vitest'

const createSanityScript = join(import.meta.dirname, '..', 'dist', 'index.js')

interface RunResult {
  code: number | null
  output: string
  stderr: string
  stdout: string
}

/**
 * Helper function to run create-sanity with given arguments and return result
 */
function runCreateSanity(
  args: string[] = [],
  env: Record<string, string> = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    const proc = spawn('node', [createSanityScript, ...args], {
      env: {...process.env, ...env},
      stdio: 'pipe',
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      resolve({code, output: stdout + stderr, stderr, stdout})
    })
  })
}

describe('create-sanity', () => {
  describe('--help', () => {
    test('returns exit code 0 and shows help text', async () => {
      const result = await runCreateSanity(['--help'])

      expect(result.code).toBe(0)
      expect(result.stdout).toMatch(/usage/i)
      expect(result.stdout).toMatch(/initialize a new sanity project/i)
      expect(result.stdout).toMatch(/options/i)
    })

    test('shows known flags like --template and --dataset', async () => {
      const result = await runCreateSanity(['--help'])

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('--template')
      expect(result.stdout).toContain('--dataset')
      expect(result.stdout).toContain('--yes')
    })

    test('does not show hidden flags', async () => {
      const result = await runCreateSanity(['--help'])

      expect(result.code).toBe(0)
      expect(result.stdout).not.toContain('--from-create')
      expect(result.stdout).not.toContain('--quickstart')
    })

    test('references `npm create sanity@latest` by default', async () => {
      const result = await runCreateSanity(['--help'])

      expect(result.code).toBe(0)
      expect(result.stdout).toMatch(/npm create sanity@latest/i)
      expect(result.stdout).not.toMatch(/sanity init/i)
    })

    test('includes -- flag separator for npm in usage line', async () => {
      const result = await runCreateSanity(['--help'], {
        npm_config_user_agent: 'npm/10.2.0 node/v20.10.0 darwin arm64',
      })

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('npm create sanity@latest -- [options]')
    })

    test('does not include -- flag separator for pnpm', async () => {
      const result = await runCreateSanity(['--help'], {
        npm_config_user_agent: 'pnpm/10.7.1 npm/? node/v22.14.0 darwin arm64',
      })

      expect(result.code).toBe(0)
      expect(result.stdout).toContain('pnpm create sanity@latest [options]')
      expect(result.stdout).not.toContain('sanity@latest -- ')
    })

    test('references `pnpm create sanity@latest` when pnpm is the package manager', async () => {
      const result = await runCreateSanity(['--help'], {
        npm_config_user_agent: 'pnpm/10.7.1 npm/? node/v22.14.0 darwin arm64',
      })

      expect(result.code).toBe(0)
      expect(result.stdout).toMatch(/pnpm create sanity@latest/i)
    })

    test('references `yarn create sanity@latest` when yarn is the package manager', async () => {
      const result = await runCreateSanity(['--help'], {
        npm_config_user_agent: 'yarn/4.0.0 npm/? node/v22.14.0 darwin arm64',
      })

      expect(result.code).toBe(0)
      expect(result.stdout).toMatch(/yarn create sanity@latest/i)
    })

    test('references `bun create sanity@latest` when bun is the package manager', async () => {
      const result = await runCreateSanity(['--help'], {
        npm_config_user_agent: 'bun/1.2.0',
      })

      expect(result.code).toBe(0)
      expect(result.stdout).toMatch(/bun create sanity@latest/i)
    })

    test('works with -h shorthand', async () => {
      const result = await runCreateSanity(['-h'])

      expect(result.code).toBe(0)
      expect(result.stdout).toMatch(/usage/i)
    })

    test('--help takes precedence over other flags', async () => {
      const result = await runCreateSanity(['--help', '--yes'])

      expect(result.code).toBe(0)
      expect(result.stdout).toMatch(/usage/i)
    })
  })

  describe('error handling', () => {
    test('invalid flag returns non-zero exit code with a clean message', async () => {
      const result = await runCreateSanity(['--invalid-flag-that-does-not-exist'])

      expect(result.code).not.toBe(0)
      expect(result.stderr).toMatch(/unknown option/i)
      expect(result.stderr).toContain('--help')
      // Should not contain a stack trace
      expect(result.stderr).not.toMatch(/^\s+at /m)
    })
  })
})
