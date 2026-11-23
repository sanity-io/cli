import {spawn} from 'node:child_process'
import {join} from 'node:path'

// eslint-disable-next-line import-js/no-extraneous-dependencies -- Vitest is a test-only dependency
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
  expect(result.output, 'Output should explain how to initialize a Blueprint').toMatch(
    /Blueprint options/,
  )
})

test('unattended Blueprint setup validates flags before loading Studio', async () => {
  const result = await runCreateSanity(['--yes', '--project-name', 'Example'])

  expect(result.code).toBe(1)
  expect(result.stderr).toContain('Pass --organization <id> to create a project.')
  expect(result.stdout).toBe('')
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

test('should reference `npm create sanity@latest` in help text', async () => {
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
