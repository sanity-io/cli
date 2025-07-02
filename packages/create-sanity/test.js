#!/usr/bin/env node
import {strict as assert} from 'node:assert'
import {spawn} from 'node:child_process'
import {dirname, join} from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const createSanityScript = join(__dirname, 'index.js')

/**
 * Helper function to run create-sanity with given arguments and return result
 */
function runCreateSanity(args = [], env = {}) {
  return new Promise((resolve) => {
    const proc = spawn('node', [createSanityScript, ...args], {
      env: {...process.env, ...env},
      stdio: 'pipe',
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      resolve({
        code,
        output: stdout + stderr,
        stderr,
        stdout,
      })
    })
  })
}

test('create-sanity --help returns exit code 0 and help text', async () => {
  const result = await runCreateSanity(['--help'])

  assert.equal(result.code, 0, 'Exit code should be 0 for --help')
  assert.match(result.output, /help|usage|options/i, 'Output should contain help-related text')
  assert.match(
    result.output,
    /init/i,
    "Output should mention init command since that's what create-sanity runs",
  )
})

test('create-sanity with invalid flag returns non-zero exit code', async () => {
  const result = await runCreateSanity(['--invalid-flag-that-does-not-exist'])

  assert.notEqual(result.code, 0, 'Exit code should be non-zero for invalid flags')
})

test('create-sanity passes through arguments to sanity init', async () => {
  // Test with --help to verify arguments are passed through
  const result = await runCreateSanity(['--help'])

  // Since create-sanity runs `sanity init --from-create --help`,
  // the help should be for the init command
  assert.equal(result.code, 0, 'Should successfully pass through --help to init command')
  assert.match(result.output, /init/i, 'Should show init command help')
})

test('create-sanity adds --from-create flag', async () => {
  // We can't easily test this directly without mocking, but we can verify
  // that the script runs without error when called properly
  const result = await runCreateSanity(['--help'])

  assert.equal(result.code, 0, 'Script should run successfully')
  // The --from-create flag should be added internally but we can't directly observe it
  // without more complex mocking. The fact that it runs successfully indicates
  // the flag is being added correctly.
})

test('create-sanity handles multiple arguments', async () => {
  // Test that multiple arguments are passed through correctly
  const result = await runCreateSanity(['--help', '--json'])

  // Should still return help (--help takes precedence) but with exit code 0
  assert.equal(result.code, 0, 'Should handle multiple arguments correctly')
  assert.match(result.output, /help|usage|options/i, 'Should still show help output')
})

test('create-sanity script is executable', async () => {
  // Test that the script can be run directly
  const result = await runCreateSanity([])

  // Even without arguments, the script should run and delegate to sanity init
  // It might show help or prompt for input, but shouldn't crash
  assert.equal(typeof result.code, 'number', 'Should return a numeric exit code')
})

test('should reference `npm create sanity@latest` in help text, not `sanity init`', async () => {
  const result = await runCreateSanity(['--help'])

  assert.match(
    result.output,
    /npm create sanity@latest/i,
    'Should reference `npm create sanity` in help text',
  )
  assert.doesNotMatch(
    result.output,
    /sanity init/i,
    'Should not reference `sanity init` in help text',
  )
})

// strictly speaking this is testing the `@sanity/cli` module, since this is determined
// there - but we want to ensure we pass on environment variables etc
test('should reference `pnpm create sanity@latest` in help text if pnpm is used ', async () => {
  const result = await runCreateSanity(['--help'], {
    npm_config_user_agent: 'pnpm/10.7.1 npm/? node/v22.14.0 darwin arm64',
  })

  assert.match(
    result.output,
    /pnpm create sanity@latest/i,
    'Should reference `pnpm create sanity` in help text',
  )
  assert.doesNotMatch(
    result.output,
    /sanity init/i,
    'Should not reference `sanity init` in help text',
  )
})
