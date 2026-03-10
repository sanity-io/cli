import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  getGlobalUninstallCommand,
  getLocalRemoveCommand,
  getLocalUpdateCommand,
} from '../commands.js'

const mockGetYarnMajorVersion = vi.hoisted(() => vi.fn())
vi.mock('@sanity/cli-core/package-manager', () => ({
  getYarnMajorVersion: mockGetYarnMajorVersion,
}))

describe('getGlobalUninstallCommand', () => {
  test('generates npm global uninstall command', () => {
    expect(getGlobalUninstallCommand('npm', '@sanity/cli')).toBe('npm uninstall -g @sanity/cli')
  })

  test('generates pnpm global uninstall command', () => {
    expect(getGlobalUninstallCommand('pnpm', '@sanity/cli')).toBe('pnpm remove -g @sanity/cli')
  })

  test('generates yarn global uninstall command', () => {
    expect(getGlobalUninstallCommand('yarn', '@sanity/cli')).toBe('yarn global remove @sanity/cli')
  })

  test('generates bun global uninstall command', () => {
    expect(getGlobalUninstallCommand('bun', '@sanity/cli')).toBe('bun remove -g @sanity/cli')
  })
})

describe('getLocalRemoveCommand', () => {
  test('generates npm remove command', () => {
    expect(getLocalRemoveCommand('npm', '@sanity/cli')).toBe('npm uninstall @sanity/cli')
  })

  test('generates pnpm remove command', () => {
    expect(getLocalRemoveCommand('pnpm', '@sanity/cli')).toBe('pnpm remove @sanity/cli')
  })

  test('generates yarn remove command', () => {
    expect(getLocalRemoveCommand('yarn', '@sanity/cli')).toBe('yarn remove @sanity/cli')
  })

  test('generates bun remove command', () => {
    expect(getLocalRemoveCommand('bun', '@sanity/cli')).toBe('bun remove @sanity/cli')
  })
})

describe('getLocalUpdateCommand', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('generates npm update command', () => {
    expect(getLocalUpdateCommand('npm', '@sanity/cli')).toBe('npm update @sanity/cli')
  })

  test('generates pnpm update command', () => {
    expect(getLocalUpdateCommand('pnpm', '@sanity/cli')).toBe('pnpm update @sanity/cli')
  })

  test('generates yarn classic upgrade command', () => {
    mockGetYarnMajorVersion.mockReturnValue(1)
    expect(getLocalUpdateCommand('yarn', '@sanity/cli')).toBe('yarn upgrade @sanity/cli')
  })

  test('generates yarn berry up command', () => {
    mockGetYarnMajorVersion.mockReturnValue(4)
    expect(getLocalUpdateCommand('yarn', '@sanity/cli')).toBe('yarn up @sanity/cli')
  })

  test('falls back to yarn upgrade when version is unknown', () => {
    mockGetYarnMajorVersion.mockReturnValue(undefined)
    expect(getLocalUpdateCommand('yarn', '@sanity/cli')).toBe('yarn upgrade @sanity/cli')
  })

  test('generates bun update command', () => {
    expect(getLocalUpdateCommand('bun', '@sanity/cli')).toBe('bun update @sanity/cli')
  })
})
