import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {DoctorCommand} from '../doctor.js'

// Prevent real subprocess spawning (npm/pnpm/yarn global queries have 10s timeouts each)
const mockExeca = vi.hoisted(() => vi.fn())
vi.mock('execa', () => ({execa: mockExeca}))

const mockWhich = vi.hoisted(() => vi.fn())
vi.mock('which', () => ({default: mockWhich}))

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
    // Default: no global package manager installations found
    mockWhich.mockRejectedValue(new Error('not found'))
    mockExeca.mockRejectedValue(new Error('not found'))
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

  test('rejects unknown flags', async () => {
    const cwd = path.join(fixturesDir, 'clean-npm-install')
    process.chdir(cwd)

    const {error} = await testCommand(DoctorCommand, ['--verbose'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Nonexistent flag: --verbose')
  })

  test('rejects unknown check names', async () => {
    const cwd = path.join(fixturesDir, 'clean-npm-install')
    process.chdir(cwd)

    const {error} = await testCommand(DoctorCommand, ['nonexistent'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unknown check: nonexistent')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('outputs JSON with errors and exits with code 1 when issues exist', async () => {
    const cwd = path.join(fixturesDir, 'standalone-npm')
    process.chdir(cwd)

    const {error, stdout} = await testCommand(DoctorCommand, ['--json'])

    const json = JSON.parse(stdout)
    expect(json.summary.errors).toBeGreaterThan(0)
    expect(json.checks.some((c: {status: string}) => c.status === 'error')).toBe(true)
    expect(error?.oclif?.exit).toBe(1)
  })
})
