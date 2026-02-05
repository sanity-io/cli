import {afterEach, describe, expect, test, vi} from 'vitest'

import {detectGlobalInstallations} from '../detectGlobals.js'

// Mock execa
const mockExeca = vi.hoisted(() => vi.fn())
vi.mock('execa', () => ({
  execa: mockExeca,
}))

// Mock which
const mockWhich = vi.hoisted(() => vi.fn())
vi.mock('which', () => ({
  default: mockWhich,
}))

describe('detectGlobalInstallations', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('detects npm global installation', async () => {
    // Mock which to find sanity
    mockWhich.mockResolvedValue('/usr/local/bin/sanity')

    // Mock npm list -g
    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            dependencies: {
              sanity: {
                resolved: '/usr/local/lib/node_modules/sanity',
                version: '3.67.0',
              },
            },
          }),
        })
      }
      // Other package managers not installed or no globals
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      isActive: true,
      packageManager: 'npm',
      packageName: 'sanity',
      version: '3.67.0',
    })
  })

  test('detects multiple global installations from different package managers', async () => {
    mockWhich.mockResolvedValue('/usr/local/bin/sanity')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            dependencies: {
              sanity: {version: '3.67.0'},
            },
          }),
        })
      }
      if (cmd === 'pnpm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify([
            {name: '@sanity/cli', path: '/usr/local/lib/pnpm-global', version: '5.33.0'},
          ]),
        })
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toHaveLength(2)
    expect(result.find((g) => g.packageName === 'sanity')).toMatchObject({
      packageManager: 'npm',
      version: '3.67.0',
    })
    expect(result.find((g) => g.packageName === '@sanity/cli')).toMatchObject({
      packageManager: 'pnpm',
      version: '5.33.0',
    })
  })

  test('returns empty array when no global installations found', async () => {
    mockWhich.mockRejectedValue(new Error('not found'))
    mockExeca.mockRejectedValue(new Error('Command failed'))

    const result = await detectGlobalInstallations()

    expect(result).toEqual([])
  })

  test('handles package manager not installed gracefully', async () => {
    mockWhich.mockRejectedValue(new Error('not found'))

    // Only npm available, others fail
    mockExeca.mockImplementation((cmd: string) => {
      if (cmd === 'npm') {
        return Promise.resolve({
          stdout: JSON.stringify({dependencies: {}}),
        })
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toEqual([])
  })

  test('marks the installation matching which as active', async () => {
    // which returns npm's path
    mockWhich.mockResolvedValue('/usr/local/bin/sanity')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            dependencies: {
              sanity: {
                resolved: '/usr/local/lib/node_modules/sanity',
                version: '3.67.0',
              },
            },
          }),
        })
      }
      if (cmd === 'pnpm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify([
            {name: 'sanity', path: '/home/user/.local/share/pnpm/global', version: '3.60.0'},
          ]),
        })
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    // npm's sanity should be active (matches which path pattern)
    const npmInstall = result.find((g) => g.packageManager === 'npm')
    const pnpmInstall = result.find((g) => g.packageManager === 'pnpm')

    expect(npmInstall?.isActive).toBe(true)
    expect(pnpmInstall?.isActive).toBe(false)
  })
})
