import {stat} from 'node:fs/promises'
import {join} from 'node:path'

import {type CliConfig} from '@sanity/cli-core/types'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {type DefineAppInput, unstable_defineApp} from '../../../defineApp.js'
import {getWorkbench} from '../getWorkbench.js'

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}))

const mockStat = vi.mocked(stat)

const enoent = () => {
  const error = new Error('ENOENT') as NodeJS.ErrnoException
  error.code = 'ENOENT'
  return error
}

const mockSourceDirExists = () => {
  mockStat.mockResolvedValueOnce({isDirectory: () => true} as never)
}

// Resolve a capability from a real branded app — the only way to a non-null
// result, so every test exercises the actual `unstable_defineApp` brand rather
// than a hand-rolled stand-in.
function workbench(overrides: Partial<DefineAppInput> = {}) {
  const app = unstable_defineApp({
    name: 'test-app',
    organizationId: 'org-id',
    title: 'Test App',
    ...overrides,
  })
  const resolved = getWorkbench({app} as CliConfig)
  if (!resolved) throw new Error('expected a workbench app')
  return resolved
}

describe('getWorkbench', () => {
  test('returns null for a plain, non-branded config', () => {
    expect(getWorkbench({app: {title: 'plain'}} as CliConfig)).toBeNull()
    expect(getWorkbench({} as CliConfig)).toBeNull()
    expect(getWorkbench(undefined)).toBeNull()
  })

  test('exposes the declared interfaces off the branded app', () => {
    const resolved = workbench({
      entry: './src/App.tsx',
      services: [{name: 'services/sync', src: './src/sync.ts', type: 'worker'}],
      views: [{name: 'views/panel', src: './src/panel.tsx', type: 'panel'}],
    })
    expect(resolved.entry).toBe('./src/App.tsx')
    expect(resolved.views).toHaveLength(1)
    expect(resolved.services).toHaveLength(1)
  })
})

describe('assertDeployable', () => {
  test('throws when the app declares no interfaces', () => {
    expect(() => workbench().assertDeployable()).toThrow('declares no entry, views or services')
  })

  test('throws when views and services are empty arrays', () => {
    expect(() => workbench({services: [], views: []}).assertDeployable()).toThrow(
      'declares no entry, views or services',
    )
  })

  test('passes when the app declares an entry', () => {
    expect(() => workbench({entry: './src/App.tsx'}).assertDeployable()).not.toThrow()
  })

  test('passes when the app declares a view', () => {
    expect(() =>
      workbench({
        views: [{name: 'views/panel', src: './src/panel.tsx', type: 'panel'}],
      }).assertDeployable(),
    ).not.toThrow()
  })

  test('passes when the app declares a service', () => {
    expect(() =>
      workbench({
        services: [{name: 'services/sync', src: './src/sync.ts', type: 'worker'}],
      }).assertDeployable(),
    ).not.toThrow()
  })
})

describe('checkBuiltOutput', () => {
  const testDir = '/test/directory'
  const manifestPath = join(testDir, 'mf-manifest.json')

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('passes when the directory contains mf-manifest.json', async () => {
    mockSourceDirExists()
    mockStat.mockResolvedValueOnce({} as never)

    await expect(
      workbench({entry: './src/App.tsx'}).checkBuiltOutput(testDir),
    ).resolves.toBeUndefined()

    expect(mockStat).toHaveBeenCalledTimes(2)
    expect(mockStat).toHaveBeenNthCalledWith(1, testDir)
    expect(mockStat).toHaveBeenNthCalledWith(2, manifestPath)
    // never checks for index.html — that contract belongs to the non-workbench checkDir
    expect(mockStat).not.toHaveBeenCalledWith(join(testDir, 'index.html'))
  })

  test('throws when the directory does not exist', async () => {
    mockStat.mockRejectedValueOnce(enoent())

    await expect(workbench({entry: './src/App.tsx'}).checkBuiltOutput(testDir)).rejects.toThrow(
      `Directory "${testDir}" does not exist`,
    )

    expect(mockStat).toHaveBeenCalledTimes(1)
  })

  test('throws when the path exists but is not a directory', async () => {
    mockStat.mockResolvedValueOnce({isDirectory: () => false} as never)

    await expect(workbench({entry: './src/App.tsx'}).checkBuiltOutput(testDir)).rejects.toThrow(
      `"${testDir}" is not a directory`,
    )

    expect(mockStat).toHaveBeenCalledTimes(1)
  })

  test('re-throws non-ENOENT errors when checking the directory', async () => {
    const permissionError = new Error('Permission denied') as NodeJS.ErrnoException
    permissionError.code = 'EACCES'
    mockStat.mockRejectedValueOnce(permissionError)

    await expect(workbench({entry: './src/App.tsx'}).checkBuiltOutput(testDir)).rejects.toThrow(
      'Permission denied',
    )
  })

  test('throws when mf-manifest.json does not exist', async () => {
    mockSourceDirExists()
    mockStat.mockRejectedValueOnce(enoent())

    await expect(workbench({entry: './src/App.tsx'}).checkBuiltOutput(testDir)).rejects.toThrow(
      `"${manifestPath}" does not exist`,
    )

    expect(mockStat).toHaveBeenNthCalledWith(2, manifestPath)
  })

  test('re-throws non-ENOENT errors when checking the manifest', async () => {
    mockSourceDirExists()

    const permissionError = new Error('Permission denied') as NodeJS.ErrnoException
    permissionError.code = 'EACCES'
    mockStat.mockRejectedValueOnce(permissionError)

    await expect(workbench({entry: './src/App.tsx'}).checkBuiltOutput(testDir)).rejects.toThrow(
      'Permission denied',
    )
  })
})
