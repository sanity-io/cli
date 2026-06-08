import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {type Output} from '@sanity/cli-core'
import {execa} from 'execa'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {parse as parseYaml} from 'yaml'

import {getPartialEnvWithNpmPath} from '../packageManagerChoice.js'
import {
  BUILD_APPROVAL_ALLOWLIST,
  getPnpmMajorVersion,
  parseIgnoredBuilds,
  printIgnoredBuildsNotice,
  writePnpmBuildApproval,
} from '../pnpmBuildApproval.js'

vi.mock('execa', () => ({execa: vi.fn()}))
vi.mock('../packageManagerChoice.js', () => ({getPartialEnvWithNpmPath: vi.fn()}))

const mockExeca = vi.mocked(execa)
const mockEnv = vi.mocked(getPartialEnvWithNpmPath)

beforeEach(() => {
  vi.clearAllMocks()
  mockEnv.mockReturnValue({PATH: '/mock/path'})
})

describe('parseIgnoredBuilds', () => {
  test('extracts deduped names from realistic pnpm 11 output', () => {
    const output = [
      ' WARN  deprecated some-pkg@1.0.0',
      ' WARN  1 deprecated subdependencies found',
      'ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: esbuild@0.27.7, esbuild@0.28.0',
      'Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.',
    ].join('\n')

    expect(parseIgnoredBuilds(output)).toEqual(['esbuild'])
  })

  test('preserves scoped names', () => {
    const output =
      'ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: @scope/pkg@1.0.0, esbuild@0.28.0'
    expect(parseIgnoredBuilds(output)).toEqual(['@scope/pkg', 'esbuild'])
  })

  test('returns [] when marker absent', () => {
    const output = ' WARN  deprecated some-pkg@1.0.0\nIgnored build scripts: esbuild@0.28.0'
    expect(parseIgnoredBuilds(output)).toEqual([])
  })

  test('returns [] for empty string', () => {
    expect(parseIgnoredBuilds('')).toEqual([])
  })

  test('BUILD_APPROVAL_ALLOWLIST contains esbuild', () => {
    expect(BUILD_APPROVAL_ALLOWLIST).toContain('esbuild')
  })
})

describe('getPnpmMajorVersion', () => {
  test('parses major version from "11.2.0"', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 0,
      failed: false,
      stderr: '',
      stdout: '11.2.0',
    } as never)

    expect(await getPnpmMajorVersion('/test/project')).toBe(11)
    expect(execa).toHaveBeenCalledWith('pnpm', ['--version'], {
      cwd: '/test/project',
      encoding: 'utf8',
      env: {PATH: '/mock/path'},
      reject: false,
    })
  })

  test('parses major version from "10.4.1\\n"', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 0,
      failed: false,
      stderr: '',
      stdout: '10.4.1\n',
    } as never)

    expect(await getPnpmMajorVersion('/test/project')).toBe(10)
  })

  test('returns undefined when exitCode is non-zero', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 1,
      failed: true,
      stderr: 'not found',
      stdout: '',
    } as never)

    expect(await getPnpmMajorVersion('/test/project')).toBeUndefined()
  })

  test('returns undefined when execa rejects', async () => {
    mockExeca.mockRejectedValue(new Error('spawn pnpm ENOENT') as never)

    expect(await getPnpmMajorVersion('/test/project')).toBeUndefined()
  })

  test('returns undefined when stdout is not a version', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 0,
      failed: false,
      stderr: '',
      stdout: 'not-a-version',
    } as never)

    expect(await getPnpmMajorVersion('/test/project')).toBeUndefined()
  })
})

describe('writePnpmBuildApproval', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'pnpm-approval-'))
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'studio'}))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  test('pnpm 11 writes allowBuilds to pnpm-workspace.yaml, leaves package.json untouched', async () => {
    await writePnpmBuildApproval(dir, 11, ['esbuild'])

    const yamlPath = path.join(dir, 'pnpm-workspace.yaml')
    expect(existsSync(yamlPath)).toBe(true)
    expect(parseYaml(readFileSync(yamlPath, 'utf8'))).toEqual({allowBuilds: {esbuild: true}})

    expect(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))).toEqual({
      name: 'studio',
    })
  })

  test('pnpm 11 merges into existing pnpm-workspace.yaml preserving other keys', async () => {
    const yamlPath = path.join(dir, 'pnpm-workspace.yaml')
    writeFileSync(yamlPath, 'packages:\n  - "packages/*"\n')

    await writePnpmBuildApproval(dir, 11, ['esbuild'])

    expect(parseYaml(readFileSync(yamlPath, 'utf8'))).toEqual({
      allowBuilds: {esbuild: true},
      packages: ['packages/*'],
    })
  })

  test('pnpm 10 unions allowlist into package.json onlyBuiltDependencies, no yaml created', async () => {
    await writePnpmBuildApproval(dir, 10, ['esbuild'])

    expect(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))).toEqual({
      name: 'studio',
      pnpm: {onlyBuiltDependencies: ['esbuild']},
    })
    expect(existsSync(path.join(dir, 'pnpm-workspace.yaml'))).toBe(false)
  })

  test('pnpm 10 does not duplicate existing onlyBuiltDependencies entries', async () => {
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'studio', pnpm: {onlyBuiltDependencies: ['esbuild', 'sharp']}}),
    )

    await writePnpmBuildApproval(dir, 10, ['esbuild'])

    expect(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))).toEqual({
      name: 'studio',
      pnpm: {onlyBuiltDependencies: ['esbuild', 'sharp']},
    })
  })

  test('pnpm 9 writes nothing', async () => {
    await writePnpmBuildApproval(dir, 9, ['esbuild'])

    expect(existsSync(path.join(dir, 'pnpm-workspace.yaml'))).toBe(false)
    expect(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))).toEqual({
      name: 'studio',
    })
  })

  test('undefined version writes nothing', async () => {
    await writePnpmBuildApproval(dir, undefined, ['esbuild'])

    expect(existsSync(path.join(dir, 'pnpm-workspace.yaml'))).toBe(false)
    expect(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))).toEqual({
      name: 'studio',
    })
  })

  test('empty allowlist writes nothing', async () => {
    await writePnpmBuildApproval(dir, 11, [])

    expect(existsSync(path.join(dir, 'pnpm-workspace.yaml'))).toBe(false)
    expect(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))).toEqual({
      name: 'studio',
    })
  })
})

const createOutput = (): Output => ({
  error: vi.fn() as never,
  log: vi.fn(),
  warn: vi.fn(),
})

describe('printIgnoredBuildsNotice', () => {
  test('pnpm with ignored builds logs notice mentioning deps and approve-builds', () => {
    const output = createOutput()
    printIgnoredBuildsNotice(output, 'pnpm', ['esbuild'])

    expect(output.log).toHaveBeenCalled()
    const logged = vi
      .mocked(output.log)
      .mock.calls.map((call) => String(call[0]))
      .join('\n')
    expect(logged).toContain('esbuild')
    expect(logged).toContain('pnpm approve-builds')
  })

  test('pnpm with no ignored builds does not log', () => {
    const output = createOutput()
    printIgnoredBuildsNotice(output, 'pnpm', [])

    expect(output.log).not.toHaveBeenCalled()
  })

  test('non-pnpm package manager does not log', () => {
    const output = createOutput()
    printIgnoredBuildsNotice(output, 'npm', ['esbuild'])

    expect(output.log).not.toHaveBeenCalled()
  })
})
