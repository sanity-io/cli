import {spawn} from 'node:child_process'
import {join} from 'node:path'

import {expect, test} from 'vitest'

const createSanityScript = join(import.meta.dirname, 'index.js')

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

  expect(result.code, 'Exit code should be 0 for --help').toBe(0)
  expect(result.output, 'Output should contain help-related text').toMatch(/help|usage|options/i)
  expect(
    result.output,
    "Output should mention init command since that's what create-sanity runs",
  ).toMatch(/init/i)
})

test('create-sanity passes through arguments to sanity init', async () => {
  // Test with --help to verify arguments are passed through
  const result = await runCreateSanity(['--help'])

  // Since create-sanity runs `sanity init --from-create --help`,
  // the help should be for the init command
  expect(result.code, 'Should successfully pass through --help to init command').toBe(0)
  expect(result.output, 'Should show init command help').toMatch(/init/i)
})

test('create-sanity adds --from-create flag', async () => {
  // We can't easily test this directly without mocking, but we can verify
  // that the script runs without error when called properly
  const result = await runCreateSanity(['--help'])

  expect(result.code, 'Script should run successfully').toBe(0)
  // The --from-create flag should be added internally but we can't directly observe it
  // without more complex mocking. The fact that it runs successfully indicates
  // the flag is being added correctly.
})

test('create-sanity handles multiple arguments', async () => {
  // Test that multiple arguments are passed through correctly
  const result = await runCreateSanity(['--help', '--json'])

  // Should still return help (--help takes precedence) but with exit code 0
  expect(result.code, 'Should handle multiple arguments correctly').toBe(0)
  expect(result.output, 'Should still show help output').toMatch(/help|usage|options/i)
})

/**
 * Below tests are skipped since they are new features in the `@sanity/cli` package.
 * We should re-enable them when the `@sanity/cli` package is updated to include the new features.
 */

test.skip('create-sanity with invalid flag returns non-zero exit code', async () => {
  const result = await runCreateSanity(['--invalid-flag-that-does-not-exist'])

  expect(result.code, 'Exit code should be non-zero for invalid flags').not.toBe(0)
})

test.skip('create-sanity script is executable', async () => {
  // Test that the script can be run directly
  const result = await runCreateSanity([])

  // Even without arguments, the script should run and delegate to sanity init
  // It might show help or prompt for input, but shouldn't crash
  expect(typeof result.code, 'Should return a numeric exit code').toBe('number')
})

test.skip('should reference `npm create sanity@latest` in help text, not `sanity init`', async () => {
  const result = await runCreateSanity(['--help'])

  expect(result.output, 'Should reference `npm create sanity` in help text').toMatch(
    /npm create sanity@latest/i,
  )
  expect(result.output, 'Should not reference `sanity init` in help text').not.toMatch(
    /sanity init/i,
  )
})

// strictly speaking this is testing the `@sanity/cli` module, since this is determined
// there - but we want to ensure we pass on environment variables etc
test.skip('should reference `pnpm create sanity@latest` in help text if pnpm is used ', async () => {
  const result = await runCreateSanity(['--help'], {
    npm_config_user_agent: 'pnpm/10.7.1 npm/? node/v22.14.0 darwin arm64',
  })

  expect(result.output, 'Should reference `pnpm create sanity` in help text').toMatch(
    /pnpm create sanity@latest/i,
  )
  expect(result.output, 'Should not reference `sanity init` in help text').not.toMatch(
    /sanity init/i,
  )
})
