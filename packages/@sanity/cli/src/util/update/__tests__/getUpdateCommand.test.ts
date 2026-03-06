import {afterEach, describe, expect, test, vi} from 'vitest'

import {getUpdateCommand} from '../getUpdateCommand.js'

const mockGetYarnMajorVersion = vi.hoisted(() => vi.fn())
vi.mock('@sanity/cli-core/package-manager', () => ({
  getYarnMajorVersion: mockGetYarnMajorVersion,
}))

describe('getUpdateCommand', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns npm update command', () => {
    expect(getUpdateCommand('npm')).toBe('npm update sanity')
  })

  test('returns pnpm update command', () => {
    expect(getUpdateCommand('pnpm')).toBe('pnpm update sanity')
  })

  test('returns bun update command', () => {
    expect(getUpdateCommand('bun')).toBe('bun update sanity')
  })

  test('returns npm update for manual', () => {
    expect(getUpdateCommand('manual')).toBe('npm update sanity')
  })

  test('returns yarn upgrade for yarn v1', () => {
    mockGetYarnMajorVersion.mockReturnValue(1)
    expect(getUpdateCommand('yarn')).toBe('yarn upgrade sanity')
  })

  test('returns yarn up for yarn v2+', () => {
    mockGetYarnMajorVersion.mockReturnValue(2)
    expect(getUpdateCommand('yarn')).toBe('yarn up sanity')
  })

  test('returns yarn up for yarn v4', () => {
    mockGetYarnMajorVersion.mockReturnValue(4)
    expect(getUpdateCommand('yarn')).toBe('yarn up sanity')
  })

  test('returns yarn upgrade when yarn version is undefined', () => {
    mockGetYarnMajorVersion.mockReturnValue(undefined)
    expect(getUpdateCommand('yarn')).toBe('yarn upgrade sanity')
  })
})
