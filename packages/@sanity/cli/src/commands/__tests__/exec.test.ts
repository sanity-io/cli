import {copyFile, mkdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

import {runCommand} from '@oclif/test'
import {setConfig} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {execa} from 'execa'
import {beforeEach, describe, expect, test} from 'vitest'
import {testExample} from '~test/helpers/testExample.js'

import {ExecCommand} from '../exec.js'

// Environment vars to set in setupTestAuth
const TEST_TOKEN = process.env.SANITY_API_TOKEN?.trim()
const TEST_CONFIG_DIR = join(tmpdir(), 'sanity-cli-test-exec')
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, 'config.json')

// Test example and fixture directory paths
let exampleDir: string
let fixtureDir: string
let scriptPath: string

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

// Helper to run sanity exec command and capture output
async function runExecCommand(
  cwd: string,
  scriptPath: string,
  flags: string[] = [],
  customEnv?: Record<string, string>,
): Promise<{exitCode: number | undefined; stderr: string; stdout: string}> {
  // Get repo root - go up from packages/@sanity/cli/src/commands/__tests__
  const repoRoot = resolve(import.meta.dirname, '../../../../../../')
  const cliPath = join(repoRoot, 'packages/@sanity/cli/bin/run.js')

  try {
    const result = await execa('node', [cliPath, 'exec', scriptPath, ...flags], {
      cwd,
      env: {...process.env, SANITY_BASE_PATH: cwd, ...customEnv},
      reject: false,
    })

    return {
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Command failed: ${error.message}`)
    }
    throw error
  }
}

describe('#exec', () => {
  beforeEach(async () => {
    exampleDir = await testExample('basic-studio')
    fixtureDir = resolve(import.meta.dirname, '../../../test/__fixtures__')
    scriptPath = join(exampleDir, 'test-script.ts')
    await copyFile(join(fixtureDir, 'exec-script.ts'), scriptPath)
  })

  test('help text is correct', async () => {
    const {stdout} = await runCommand('exec --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Executes a script within the Sanity Studio context

      USAGE
        $ sanity exec SCRIPT... [--mock-browser-env] [--with-user-token]

      ARGUMENTS
        SCRIPT...  Path to the script to execute

      FLAGS
        --mock-browser-env  Mocks a browser-like environment using jsdom
        --with-user-token   Prime access token from CLI config into getCliClient()

      DESCRIPTION
        Executes a script within the Sanity Studio context

      EXAMPLES
        Run the script at some/script.js in Sanity context

          $ sanity exec some/script.js

        Run the script at migrations/fullname.ts and configure getCliClient() to
        include the current user token

          $ sanity exec migrations/fullname.ts --with-user-token

        Run the script at scripts/browserScript.js in a mock browser environment

          $ sanity exec scripts/browserScript.js --mock-browser-env

        Pass arbitrary arguments to scripts by separating them with a \`--\`.
        Arguments are available in \`process.argv\` as they would in regular node
        scripts

          $ sanity exec --mock-browser-env myscript.js -- --dry-run \\
            positional-argument

      "
    `)
  })

  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(ExecCommand, [scriptPath, '--invalid'], {
      config: {root: exampleDir},
    })

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })

  test('validates that script argument is required', async () => {
    const {error} = await testCommand(ExecCommand, [])

    expect(error?.message).toContain('Missing 1 required arg')
    expect(error?.message).toContain('script')
  })

  test('validates that script file exists', async () => {
    const nonExistentScript = join(exampleDir, 'non-existent-script.ts')

    const {error} = await testCommand(ExecCommand, [nonExistentScript], {
      config: {root: exampleDir},
    })

    expect(error?.message).toContain('No file found at')
  })

  describe('integration tests', () => {
    test('executes script successfully', async () => {
      const {exitCode, stdout} = await runExecCommand(exampleDir, scriptPath)

      expect(exitCode).toBe(0)

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
        const {exitCode, stderr, stdout} = await runExecCommand(
          exampleDir,
          scriptPath,
          ['--with-user-token'],
          {
            SANITY_CLI_CONFIG_PATH: TEST_CONFIG_PATH,
            SANITY_INTERNAL_ENV: 'staging',
          },
        )

        if (exitCode !== 0) {
          console.error('stderr:', stderr)
          console.error('stdout:', stdout)
        }

        expect(exitCode).toBe(0)

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
      const {exitCode, stderr, stdout} = await runExecCommand(exampleDir, scriptPath, [
        '--mock-browser-env',
      ])

      if (exitCode !== 0) {
        console.error('stderr:', stderr)
        console.error('stdout:', stdout)
      }

      expect(exitCode).toBe(0)

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
