import {readFile, stat} from 'node:fs/promises'
import {join} from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {checkWorkbenchAppDir} from '../checkWorkbenchAppDir.js'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}))

const mockStat = vi.mocked(stat)
const mockReadFile = vi.mocked(readFile)

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

describe('#checkWorkbenchAppDir', () => {
  const testDir = '/test/directory'
  const manifestPath = join(testDir, 'mf-manifest.json')

  const validManifest = {
    exposes: [
      {
        assets: {
          css: {async: [], sync: ['assets/panel.css']},
          js: {async: [], sync: ['assets/panel.js']},
        },
        name: 'views/favorites/panel',
      },
    ],
    metaData: {
      remoteEntry: {name: 'remote-entry.js'},
    },
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should pass when the manifest exists and exposes at least one module', async () => {
    mockSourceDirExists()
    mockReadFile.mockResolvedValueOnce(JSON.stringify(validManifest))

    await expect(checkWorkbenchAppDir(testDir)).resolves.toBeUndefined()

    expect(mockReadFile).toHaveBeenCalledWith(manifestPath, 'utf8')
    // never checks for index.html — that contract belongs to checkDir
    expect(mockStat).not.toHaveBeenCalledWith(join(testDir, 'index.html'))
  })

  test('should throw error when directory does not exist', async () => {
    mockStat.mockRejectedValueOnce(enoent())

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow(
      `Directory "${testDir}" does not exist`,
    )

    expect(mockReadFile).not.toHaveBeenCalled()
  })

  test('should throw error when path exists but is not a directory', async () => {
    mockStat.mockResolvedValueOnce({
      isDirectory: () => false,
    } as never)

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow(
      `Directory ${testDir} is not a directory`,
    )

    expect(mockReadFile).not.toHaveBeenCalled()
  })

  test('should re-throw non-ENOENT errors when checking directory', async () => {
    const permissionError = new Error('Permission denied') as NodeJS.ErrnoException
    permissionError.code = 'EACCES'
    mockStat.mockRejectedValueOnce(permissionError)

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow('Permission denied')
  })

  test('should throw when mf-manifest.json does not exist', async () => {
    mockSourceDirExists()
    mockReadFile.mockRejectedValueOnce(enoent())

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow(`"${manifestPath}" does not exist`)
  })

  test('should throw when mf-manifest.json is not valid JSON', async () => {
    mockSourceDirExists()
    mockReadFile.mockResolvedValueOnce('not json{')

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow(
      `"${manifestPath}" is not valid JSON`,
    )
  })

  test('should throw when manifest declares no exposed modules', async () => {
    mockSourceDirExists()
    mockReadFile.mockResolvedValueOnce(JSON.stringify({...validManifest, exposes: []}))

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow('declares no exposed modules')
  })

  test('should re-throw non-ENOENT errors when reading the manifest', async () => {
    mockSourceDirExists()

    const permissionError = new Error('Permission denied') as NodeJS.ErrnoException
    permissionError.code = 'EACCES'
    mockReadFile.mockRejectedValueOnce(permissionError)

    await expect(checkWorkbenchAppDir(testDir)).rejects.toThrow('Permission denied')
  })
})
