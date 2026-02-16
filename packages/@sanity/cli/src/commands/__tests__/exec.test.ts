import {type SpawnOptions} from 'node:child_process'
import {copyFile, mkdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

import {setConfig} from '@sanity/cli-core'
import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ExecCommand} from '../exec.js'

// Environment vars to set in setupTestAuth
const TEST_TOKEN = process.env.SANITY_API_TOKEN?.trim()
const TEST_CONFIG_DIR = join(tmpdir(), 'sanity-cli-test-exec')
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, 'config.json')

const fixtureDir = resolve(import.meta.dirname, '../../../test/__fixtures__')

// Mock spawn to capture output instead of inheriting
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: (command: string, args: string[], options: SpawnOptions) => {
      // Change stdio from 'inherit' to 'pipe' so we can capture output
      const proc = actual.spawn(command, args, {
        ...options,
        stdio: ['inherit', 'pipe', 'pipe'],
      })

      // Forward to process.stdout/stderr so testCommand captures it
      proc.stdout?.pipe(process.stdout)
      proc.stderr?.pipe(process.stderr)

      return proc
    },
  }
})

// Helper to set up test authentication config
async function setupTestAuth(token: string): Promise<{cleanup: () => Promise<void>}> {
  await mkdir(TEST_CONFIG_DIR, {recursive: true})

  // Use cli-core's setConfig to write token to config file
  // Need to set env vars so it writes to the test config path
  const originalConfigPath = process.env.SANITY_CLI_CONFIG_PATH

  process.env.SANITY_CLI_CONFIG_PATH = TEST_CONFIG_PATH

  try {
    await setConfig('authToken', token)
  } finally {
    // Restore original env vars
    if (originalConfigPath) {
      process.env.SANITY_CLI_CONFIG_PATH = originalConfigPath
    } else {
      delete process.env.SANITY_CLI_CONFIG_PATH
    }
  }

  return {cleanup: () => rm(TEST_CONFIG_DIR, {force: true, recursive: true})}
}

describe('#exec', {timeout: 15 * 1000}, () => {
  test('shows an error for invalid flags', async () => {
    const exampleDir = await testFixture('basic-studio')
    process.chdir(exampleDir)

    const scriptPath = join(exampleDir, 'test-script.ts')
    await copyFile(join(fixtureDir, 'exec-script.ts'), scriptPath)

    const {error} = await testCommand(ExecCommand, [scriptPath, '--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })

  test('validates that script argument is required', async () => {
    const {error} = await testCommand(ExecCommand, [])

    expect(error?.message).toContain('Missing 1 required arg')
    expect(error?.message).toContain('script')
  })

  test('validates that script file exists', async () => {
    const {error} = await testCommand(ExecCommand, ['non-existent-script.ts'])

    expect(error?.message).toContain('No file found at')
  })

  describe('integration tests', () => {
    // Test example and fixture directory paths
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

    test('executes script successfully', async () => {
      const {error, stdout} = await testCommand(ExecCommand, [scriptPath])

      if (error) throw error

      // Parse the JSON output
      const data = JSON.parse(stdout.trim())
      expect(data.success).toBe(true)
      expect(data.env.SANITY_BASE_PATH).toBe(exampleDir)
      // Without token, API returns empty object rather than throwing error
      expect(data.user).toEqual({})
    })

    test.skipIf(!TEST_TOKEN)('executes script with --with-user-token flag', async () => {
      if (!TEST_TOKEN) return // TypeScript guard

      // Set up test auth config with token
      const {cleanup} = await setupTestAuth(TEST_TOKEN)

      try {
        vi.stubEnv('SANITY_CLI_CONFIG_PATH', TEST_CONFIG_PATH)
        vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')
        const {error, stdout} = await testCommand(ExecCommand, [scriptPath, '--with-user-token'])

        if (error) throw error

        // Parse the JSON output
        const data = JSON.parse(stdout.trim())
        expect(data.success).toBe(true)
        expect(data.env.SANITY_BASE_PATH).toBe(exampleDir)
        expect(data.user.id).toBeDefined()
        expect(data.user.email).toBeDefined()
        expect(data.user.id).not.toBe('unknown')
        expect(data.user.email).not.toBe('unknown')
      } finally {
        // Clean up test config
        await cleanup()
      }
    })

    test('executes script with --mock-browser-env flag', async () => {
      const {error, stdout} = await testCommand(ExecCommand, [scriptPath, '--mock-browser-env'])

      if (error) throw error

      // Parse the JSON output
      const data = JSON.parse(stdout.trim())
      expect(data.success).toBe(true)
      // injected by mockBrowserEnvironment
      expect(data.browser.intersectionObserver).toBe(true)
      // injected by the command itself
      expect(data.env.SANITY_BASE_PATH).toBe(exampleDir)
    })
  })
})
