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
    mockWhich.mockResolvedValue('/usr/local/bin/sanity')

    // Mock npm list -g
    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            dependencies: {
              sanity: {
                resolved: 'https://registry.npmjs.org/sanity/-/sanity-3.67.0.tgz',
                version: '3.67.0',
              },
            },
            path: '/usr/local/lib',
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
            path: '/usr/local/lib',
          }),
        })
      }
      if (cmd === 'pnpm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify([
            {
              dependencies: {
                '@sanity/cli': {
                  path: '/usr/local/lib/pnpm-global/node_modules/@sanity/cli',
                  version: '5.33.0',
                },
              },
              path: '/usr/local/lib/pnpm-global',
            },
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

  test('detects bun global installation', async () => {
    mockWhich.mockResolvedValue('/home/user/.bun/bin/sanity')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'bun' && args.includes('pm')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            dependencies: {
              sanity: {
                resolved: '/home/user/.bun/install/global/node_modules/sanity',
                version: '3.67.0',
              },
            },
          }),
        })
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      isActive: true,
      packageManager: 'bun',
      packageName: 'sanity',
      version: '3.67.0',
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
    mockWhich.mockResolvedValue('/usr/local/bin/sanity')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            dependencies: {
              sanity: {version: '3.67.0'},
            },
            path: '/usr/local/lib',
          }),
        })
      }
      if (cmd === 'pnpm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify([
            {
              dependencies: {
                sanity: {
                  path: '/home/user/.local/share/pnpm/global/5/node_modules/sanity',
                  version: '3.60.0',
                },
              },
              path: '/home/user/.local/share/pnpm/global/5',
            },
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

  test('marks @sanity/cli as active when it is the only global from the active pm', async () => {
    mockWhich.mockResolvedValue('/usr/local/bin/sanity')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            dependencies: {
              '@sanity/cli': {version: '5.33.0'},
            },
            path: '/usr/local/lib',
          }),
        })
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      isActive: true,
      packageManager: 'npm',
      packageName: '@sanity/cli',
      version: '5.33.0',
    })
  })

  test('handles npm output with warning prefix before JSON', async () => {
    mockWhich.mockResolvedValue('/usr/local/bin/sanity')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('list')) {
        // npm sometimes prints warnings before JSON
        return Promise.resolve({
          stdout: `npm warn config global \`--global\`, \`--local\` are deprecated\n${JSON.stringify(
            {
              dependencies: {
                sanity: {version: '3.67.0'},
              },
              path: '/usr/local/lib',
            },
          )}`,
        })
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      packageManager: 'npm',
      packageName: 'sanity',
      version: '3.67.0',
    })
  })

  test('marks npm as active for nvm binary path', async () => {
    // nvm: binary at <prefix>/bin, lib at <prefix>/lib
    mockWhich.mockResolvedValue('/home/user/.nvm/versions/node/v20.11.0/bin/sanity')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            dependencies: {
              sanity: {version: '3.67.0'},
            },
            path: '/home/user/.nvm/versions/node/v20.11.0/lib',
          }),
        })
      }
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

  test('marks npm as active for homebrew binary path', async () => {
    mockWhich.mockResolvedValue('/opt/homebrew/bin/sanity')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            dependencies: {
              sanity: {version: '3.67.0'},
            },
            path: '/opt/homebrew/lib',
          }),
        })
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      isActive: true,
      packageManager: 'npm',
      packageName: 'sanity',
    })
  })

  test('does not mark npm as active when binary is from a different tool manager', async () => {
    // Volta shim at ~/.volta/bin — not in npm's bin dir
    mockWhich.mockResolvedValue('/home/user/.volta/bin/sanity')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            dependencies: {
              sanity: {version: '3.67.0'},
            },
            path: '/home/user/.volta/tools/image/node/20.11.0/lib',
          }),
        })
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      isActive: false,
      packageManager: 'npm',
      packageName: 'sanity',
    })
  })

  test('does not mark npm as active when no npm globals exist', async () => {
    // Generic path but only pnpm globals — should not assume npm
    mockWhich.mockResolvedValue('/some/unknown/path/sanity')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'pnpm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify([
            {
              dependencies: {
                sanity: {version: '3.67.0'},
              },
              path: '/home/user/.local/share/pnpm/global/5',
            },
          ]),
        })
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      isActive: false,
      packageManager: 'pnpm',
      packageName: 'sanity',
    })
  })

  test('detects pnpm active binary on Windows path without dot prefix', async () => {
    // Windows pnpm installs to AppData\Local\pnpm\sanity.CMD
    mockWhich.mockResolvedValue('C:\\Users\\user\\AppData\\Local\\pnpm\\sanity.CMD')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'pnpm' && args.includes('list')) {
        return Promise.resolve({
          stdout: JSON.stringify([
            {
              dependencies: {
                sanity: {version: '3.67.0'},
              },
              path: 'C:\\Users\\user\\AppData\\Local\\pnpm\\global\\5',
            },
          ]),
        })
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      isActive: true,
      packageManager: 'pnpm',
      packageName: 'sanity',
    })
  })

  test('detects yarn classic global installation', async () => {
    mockWhich.mockResolvedValue('/usr/local/bin/sanity')

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'yarn' && args.includes('global')) {
        // Yarn classic NDJSON: one JSON object per line
        const lines = [
          JSON.stringify({data: '"sanity@3.67.0" has binaries:\n  - sanity', type: 'info'}),
          JSON.stringify({data: '"@sanity/cli@5.33.0" has binaries:\n  - sanity', type: 'info'}),
        ].join('\n')
        return Promise.resolve({stdout: lines})
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toHaveLength(2)
    expect(result.find((g) => g.packageName === 'sanity')).toMatchObject({
      packageManager: 'yarn',
      version: '3.67.0',
    })
    expect(result.find((g) => g.packageName === '@sanity/cli')).toMatchObject({
      packageManager: 'yarn',
      version: '5.33.0',
    })
  })

  test('ignores yarn NDJSON lines without matching packages', async () => {
    mockWhich.mockRejectedValue(new Error('not found'))

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'yarn' && args.includes('global')) {
        const lines = [
          JSON.stringify({data: '"typescript@5.4.0" has binaries:\n  - tsc', type: 'info'}),
          JSON.stringify({data: '"eslint@9.0.0" has binaries:\n  - eslint', type: 'info'}),
        ].join('\n')
        return Promise.resolve({stdout: lines})
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toEqual([])
  })

  test('handles malformed yarn NDJSON lines gracefully', async () => {
    mockWhich.mockRejectedValue(new Error('not found'))

    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'yarn' && args.includes('global')) {
        const lines = [
          'not valid json',
          JSON.stringify({data: '"sanity@3.67.0" has binaries:\n  - sanity', type: 'info'}),
          '{broken',
        ].join('\n')
        return Promise.resolve({stdout: lines})
      }
      return Promise.reject(new Error('Command not found'))
    })

    const result = await detectGlobalInstallations()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      packageManager: 'yarn',
      packageName: 'sanity',
      version: '3.67.0',
    })
  })
})
