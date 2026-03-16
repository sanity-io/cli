// Separate file from exec.test.ts because getCliToken() in @sanity/cli-core caches the resolved
// token at module level. A separate file gives us a fresh module scope, so the "no token" error
// test isn't order-dependent on tests that successfully resolve a token.
import {type SpawnOptions} from 'node:child_process'
import {copyFile, mkdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

import {CLIError} from '@oclif/core/errors'
import {setCliUserConfig} from '@sanity/cli-core'
import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ExecCommand} from '../exec.js'

const TEST_CONFIG_DIR = join(tmpdir(), 'sanity-cli-test-exec-token')
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, 'config.json')

const fixtureDir = resolve(import.meta.dirname, '../../../test/__fixtures__')

// Mock spawn to capture output instead of inheriting
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: (command: string, args: string[], options: SpawnOptions) => {
      const proc = actual.spawn(command, args, {
        ...options,
        stdio: ['inherit', 'pipe', 'pipe'],
      })

      proc.stdout?.pipe(process.stdout)
      proc.stderr?.pipe(process.stderr)

      return proc
    },
  }
})

async function setupTestAuth(token: string): Promise<{cleanup: () => Promise<void>}> {
  await mkdir(TEST_CONFIG_DIR, {recursive: true})
  vi.stubEnv('SANITY_CLI_CONFIG_PATH', TEST_CONFIG_PATH)
  await setCliUserConfig('authToken', token)

  return {cleanup: () => rm(TEST_CONFIG_DIR, {force: true, recursive: true})}
}

describe('exec --with-user-token', {timeout: 15 * 1000}, () => {
  let exampleDir: string
  let scriptPath: string

  beforeEach(async () => {
    exampleDir = await testFixture('basic-studio')
    process.chdir(exampleDir)

    scriptPath = join(exampleDir, 'test-script.ts')
    await copyFile(join(fixtureDir, 'exec-script.ts'), scriptPath)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('errors when no auth token is found', async () => {
    // Ensure no token is available from any source
    vi.stubEnv('SANITY_AUTH_TOKEN', '')
    vi.stubEnv('SANITY_CLI_CONFIG_PATH', join(tmpdir(), 'sanity-cli-nonexistent', 'config.json'))

    const {error} = await testCommand(ExecCommand, [scriptPath, '--with-user-token'])

    expect(error).toBeInstanceOf(CLIError)
    expect(error?.message).toContain('--with-user-token specified')
    expect(error?.message).toContain('sanity login')
  })

  test('passes token to getCliClient()', async () => {
    const tokenScriptPath = join(exampleDir, 'test-token-script.ts')
    await copyFile(join(fixtureDir, 'exec-get-user-token.ts'), tokenScriptPath)

    const {cleanup} = await setupTestAuth('test-fake-token-abc123')

    try {
      const {error, stdout} = await testCommand(ExecCommand, [tokenScriptPath, '--with-user-token'])

      if (error) throw error

      const data = JSON.parse(stdout.trim())
      expect(data.success).toBe(true)
      expect(data.token).toBe('test-fake-token-abc123')
    } finally {
      await cleanup()
    }
  })
})
