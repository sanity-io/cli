import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {DoctorCommand} from '../doctor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(
  __dirname,
  '..',
  '..',
  'util',
  'packageManager',
  'installationInfo',
  '__tests__',
  '__fixtures__',
)

describe('doctor command', () => {
  const originalCwd = process.cwd()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.chdir(originalCwd)
  })

  test('runs diagnostics and shows results', async () => {
    const cwd = path.join(fixturesDir, 'clean-npm-install')
    process.chdir(cwd)

    const {error, stdout} = await testCommand(DoctorCommand, [])

    expect(error).toBeUndefined()
    expect(stdout).toContain('CLI Installation')
    // clean-npm-install is a clean install — should show success
    expect(stdout).toContain('no issues found')
  })

  test('outputs JSON when --json flag is provided', async () => {
    const cwd = path.join(fixturesDir, 'clean-npm-install')
    process.chdir(cwd)

    const {error, stdout} = await testCommand(DoctorCommand, ['--json'])

    expect(error).toBeUndefined()
    const json = JSON.parse(stdout)
    expect(json.checks).toBeDefined()
    expect(json.summary).toBeDefined()
    expect(Array.isArray(json.checks)).toBe(true)
  })

  test('shows summary at the end', async () => {
    const cwd = path.join(fixturesDir, 'clean-npm-install')
    process.chdir(cwd)

    const {error, stdout} = await testCommand(DoctorCommand, [])

    expect(error).toBeUndefined()
    expect(stdout).toMatch(/\d+ passed/)
  })

  test('exits with error code 1 when issues are found', async () => {
    // standalone-npm has sanity declared but no node_modules — declared-not-installed error
    const cwd = path.join(fixturesDir, 'standalone-npm')
    process.chdir(cwd)

    const {error, stdout} = await testCommand(DoctorCommand, [])

    expect(error?.oclif?.exit).toBe(1)
    expect(stdout).toMatch(/\d+ error/)
  })

  test('outputs JSON with errors when issues exist', async () => {
    const cwd = path.join(fixturesDir, 'standalone-npm')
    process.chdir(cwd)

    const {stdout} = await testCommand(DoctorCommand, ['--json'])

    const json = JSON.parse(stdout)
    expect(json.summary.errors).toBeGreaterThan(0)
    expect(json.checks.some((c: {status: string}) => c.status === 'error')).toBe(true)
  })
})
