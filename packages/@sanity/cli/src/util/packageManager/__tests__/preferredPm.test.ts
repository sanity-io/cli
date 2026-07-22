import fs from 'node:fs'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {preferredPm} from '../preferredPm.js'

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}))

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)

describe('preferredPm', () => {
  const projectDir = path.resolve('/project')
  let files: Map<string, string>

  beforeEach(() => {
    files = new Map()
    mockExistsSync.mockImplementation((filePath) => files.has(String(filePath)))
    mockReadFileSync.mockImplementation((filePath) => {
      const contents = files.get(String(filePath))
      if (contents === undefined) throw new Error(`ENOENT: ${String(filePath)}`)
      return contents
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  function addFile(relativePath: string, contents = ''): void {
    files.set(path.join(projectDir, relativePath), contents)
  }

  test('prioritizes packageManager over lock files and devEngines', () => {
    addFile(
      'package.json',
      JSON.stringify({
        devEngines: {packageManager: {name: 'npm'}},
        packageManager: 'pnpm@9.1.2',
      }),
    )
    addFile('package-lock.json')

    expect(preferredPm(projectDir)).toBe('pnpm')
  })

  test('supports hashed packageManager versions', () => {
    addFile(
      'package.json',
      JSON.stringify({
        packageManager: 'yarn@4.1.0+sha224.fd21d9eb5fba020083811af1d4953acc21eeb9f6',
      }),
    )

    expect(preferredPm(projectDir)).toBe('yarn')
  })

  test('falls back from an unknown packageManager to devEngines', () => {
    addFile(
      'package.json',
      JSON.stringify({
        devEngines: {packageManager: {name: 'bun'}},
        packageManager: 'unknown@1.0.0',
      }),
    )

    expect(preferredPm(projectDir)).toBe('bun')
  })

  test('supports a single-entry array of devEngines package managers', () => {
    addFile('package.json', JSON.stringify({devEngines: {packageManager: [{name: 'yarn'}]}}))

    expect(preferredPm(projectDir)).toBe('yarn')
  })

  test('ignores multiple alternative devEngines package managers', () => {
    addFile(
      'package.json',
      JSON.stringify({devEngines: {packageManager: [{name: 'yarn'}, {name: 'npm'}]}}),
    )
    addFile('package-lock.json')

    expect(preferredPm(projectDir)).toBe('npm')
  })

  test.each([
    ['a malformed declaration', {packageManager: 'pnpm'}],
    ['an unknown package manager', {packageManager: {name: 'unknown'}}],
  ])('ignores %s in devEngines', (_, devEngines) => {
    addFile('package.json', JSON.stringify({devEngines}))
    addFile('package-lock.json')

    expect(preferredPm(projectDir)).toBe('npm')
  })

  test('falls back to lock files when package.json is malformed', () => {
    addFile('package.json', '{invalid')
    addFile('pnpm-lock.yaml')

    expect(preferredPm(projectDir)).toBe('pnpm')
  })

  test('checks npm lock files after other package manager lock files', () => {
    addFile('package-lock.json')
    addFile('pnpm-lock.yaml')

    expect(preferredPm(projectDir)).toBe('pnpm')
  })

  test('detects npm-shrinkwrap.json', () => {
    addFile('npm-shrinkwrap.json')

    expect(preferredPm(projectDir)).toBe('npm')
  })

  test('prioritizes a workspace packageManager over a parent pnpm lock file', () => {
    addFile(
      'package.json',
      JSON.stringify({packageManager: 'yarn@4.1.0', workspaces: ['packages/*']}),
    )
    addFile('pnpm-lock.yaml')
    const childDir = path.join(projectDir, 'packages', 'child')
    files.set(path.join(childDir, 'package.json'), JSON.stringify({name: 'child'}))

    expect(preferredPm(childDir)).toBe('yarn')
  })
})
