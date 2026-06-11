import {stat} from 'node:fs/promises'
import {join} from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {checkWorkbenchApp, checkWorkbenchAppDir} from '../workbenchChecks.js'

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
  mockStat.mockResolvedValueOnce({
    isDirectory: () => true,
  } as never)
}

describe('#checkWorkbenchApp', () => {
  test('should throw when the app declares no interfaces', () => {
    expect(() => checkWorkbenchApp({})).toThrow('declares no entry, views or services')
  })

  test('should throw when views and services are empty arrays', () => {
    expect(() => checkWorkbenchApp({services: [], views: []})).toThrow(
      'declares no entry, views or services',
    )
  })

  test('should pass when the app declares an entry', () => {
    expect(() => checkWorkbenchApp({entry: './src/App.tsx'})).not.toThrow()
  })

  test('should pass when the app declares a view', () => {
    expect(() =>
      checkWorkbenchApp({views: [{name: 'views/panel', src: './src/panel.tsx', type: 'panel'}]}),
    ).not.toThrow()
  })

  test('should pass when the app declares a service', () => {
    expect(() =>
      checkWorkbenchApp({
        services: [{name: 'services/sync', src: './src/sync.ts', type: 'worker'}],
      }),
    ).not.toThrow()
  })
})

describe('#checkWorkbenchAppDir', () => {
  const testDir = '/test/directory'
  const manifestPath = join(testDir, 'mf-manifest.json')

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should pass when the directory contains mf-manifest.json', async () => {
    mockSourceDirExists()
    mockStat.mockResolvedValueOnce({} as never)

    await expect(checkWorkbenchAppDir(testDir)).resolves.toBeUndefined()

    expect(mockStat).toHaveBeenCalledTimes(2)
    expect(mockStat).toHaveBeenNthCalledWith(1, testDir)
    expect(mockStat).toHaveBeenNthCalledWith(2, manifestPath)
    // never checks for index.html — that contract belongs to checkDir
    expect(mockStat).not.toHaveBeenCalledWith(join(testDir, 'index.html'))
  })

  test('should throw error when directory does not exist', async () => {
    mockStat.mockRejectedValueOnce(enoent())

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow(
      `Directory "${testDir}" does not exist`,
    )

    expect(mockStat).toHaveBeenCalledTimes(1)
  })

  test('should throw error when path exists but is not a directory', async () => {
    mockStat.mockResolvedValueOnce({
      isDirectory: () => false,
    } as never)

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow(
      `Directory ${testDir} is not a directory`,
    )

    expect(mockStat).toHaveBeenCalledTimes(1)
  })

  test('should re-throw non-ENOENT errors when checking directory', async () => {
    const permissionError = new Error('Permission denied') as NodeJS.ErrnoException
    permissionError.code = 'EACCES'
    mockStat.mockRejectedValueOnce(permissionError)

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow('Permission denied')
  })

  test('should throw when mf-manifest.json does not exist', async () => {
    mockSourceDirExists()
    mockStat.mockRejectedValueOnce(enoent())

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow(`"${manifestPath}" does not exist`)

    expect(mockStat).toHaveBeenNthCalledWith(2, manifestPath)
  })

  test('should re-throw non-ENOENT errors when checking the manifest', async () => {
    mockSourceDirExists()

    const permissionError = new Error('Permission denied') as NodeJS.ErrnoException
    permissionError.code = 'EACCES'
    mockStat.mockRejectedValueOnce(permissionError)

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow('Permission denied')
  })
})
