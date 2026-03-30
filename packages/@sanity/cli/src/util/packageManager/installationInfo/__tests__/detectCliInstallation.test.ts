import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {detectCliInstallation} from '../index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, '__fixtures__')

// Mock nano-spawn for global detection
const mockSpawn = vi.hoisted(() => vi.fn())
vi.mock('nano-spawn', () => ({
  default: mockSpawn,
}))

// Mock which
const mockWhich = vi.hoisted(() => vi.fn())
vi.mock('which', () => ({
  default: mockWhich,
}))

describe('detectCliInstallation', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('detects standalone npm project', async () => {
    // No globals
    mockWhich.mockRejectedValue(new Error('not found'))
    mockSpawn.mockRejectedValue(new Error('not found'))

    const cwd = path.join(fixturesDir, 'standalone-npm')
    const result = await detectCliInstallation({cwd})

    expect(result.workspace.type).toBe('standalone')
    expect(result.workspace.root).toBe(cwd)
    expect(result.workspace.lockfile?.type).toBe('npm')
    expect(result.packages.sanity?.declared).not.toBeNull()
    expect(result.packages.sanity?.declared?.versionRange).toBe('^3.67.0')
  })

  test('detects pnpm workspace with catalog resolution', async () => {
    mockWhich.mockRejectedValue(new Error('not found'))
    mockSpawn.mockRejectedValue(new Error('not found'))

    const workspaceRoot = path.join(fixturesDir, 'pnpm-workspace-with-catalog')
    const cwd = path.join(workspaceRoot, 'packages', 'studio')
    const result = await detectCliInstallation({cwd})

    expect(result.workspace.type).toBe('pnpm-workspaces')
    expect(result.workspace.root).toBe(workspaceRoot)
    expect(result.packages.sanity?.declared).not.toBeNull()
    expect(result.packages.sanity?.declared?.declaredVersionRange).toBe('catalog:')
    expect(result.packages.sanity?.declared?.versionRange).toBe('^3.67.0') // resolved
  })

  test('detects npm workspaces', async () => {
    mockWhich.mockRejectedValue(new Error('not found'))
    mockSpawn.mockRejectedValue(new Error('not found'))

    const workspaceRoot = path.join(fixturesDir, 'npm-workspaces')
    const cwd = path.join(workspaceRoot, 'packages', 'studio')
    const result = await detectCliInstallation({cwd})

    expect(result.workspace.type).toBe('npm-workspaces')
    expect(result.workspace.root).toBe(workspaceRoot)
  })

  test('detects npm overrides', async () => {
    mockWhich.mockRejectedValue(new Error('not found'))
    mockSpawn.mockRejectedValue(new Error('not found'))

    const cwd = path.join(fixturesDir, 'with-npm-overrides')
    const result = await detectCliInstallation({cwd})

    expect(result.packages['@sanity/cli']?.override).not.toBeNull()
    expect(result.packages['@sanity/cli']?.override?.mechanism).toBe('npm-overrides')
    expect(result.packages['@sanity/cli']?.override?.versionRange).toBe('^5.30.0')
  })

  test('detects yarn resolutions', async () => {
    mockWhich.mockRejectedValue(new Error('not found'))
    mockSpawn.mockRejectedValue(new Error('not found'))

    const cwd = path.join(fixturesDir, 'with-yarn-resolutions')
    const result = await detectCliInstallation({cwd})

    expect(result.packages['@sanity/cli']?.override).not.toBeNull()
    expect(result.packages['@sanity/cli']?.override?.mechanism).toBe('yarn-resolutions')
  })

  test('detects multiple lockfiles issue', async () => {
    mockWhich.mockRejectedValue(new Error('not found'))
    mockSpawn.mockRejectedValue(new Error('not found'))

    const cwd = path.join(fixturesDir, 'multiple-lockfiles')
    const result = await detectCliInstallation({cwd})

    expect(result.workspace.hasMultipleLockfiles).toBe(true)
    expect(result.issues.some((i) => i.type === 'multiple-lockfiles')).toBe(true)
  })

  test('detects global installation', async () => {
    mockWhich.mockResolvedValue('/usr/local/bin/sanity')
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
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
      return Promise.reject(new Error('not found'))
    })

    const cwd = path.join(fixturesDir, 'standalone-npm')
    const result = await detectCliInstallation({cwd})

    expect(result.globalInstallations).toHaveLength(1)
    expect(result.globalInstallations[0]).toMatchObject({
      isActive: true,
      packageManager: 'npm',
      packageName: 'sanity',
      version: '3.67.0',
    })
  })
})
