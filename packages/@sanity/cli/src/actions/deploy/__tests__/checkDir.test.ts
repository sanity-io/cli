import {readFile, stat} from 'node:fs/promises'
import {join} from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {checkDir} from '../checkDir.js'

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

describe('#checkDir', () => {
  const testDir = '/test/directory'

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should pass when directory exists and contains index.html', async () => {
    // Mock directory exists and is a directory
    mockStat.mockResolvedValueOnce({
      isDirectory: () => true,
    } as never)

    // Mock index.html exists
    mockStat.mockResolvedValueOnce({} as never)

    await expect(checkDir(testDir)).resolves.toBeUndefined()

    expect(mockStat).toHaveBeenCalledTimes(2)
    expect(mockStat).toHaveBeenNthCalledWith(1, testDir)
    expect(mockStat).toHaveBeenNthCalledWith(2, join(testDir, 'index.html'))
  })

  test('should throw error when directory does not exist', async () => {
    const enoentError = new Error('ENOENT') as NodeJS.ErrnoException
    enoentError.code = 'ENOENT'

    mockStat.mockRejectedValueOnce(enoentError)

    await expect(checkDir(testDir)).rejects.toThrow(`Directory "${testDir}" does not exist`)

    expect(mockStat).toHaveBeenCalledTimes(1)
    expect(mockStat).toHaveBeenCalledWith(testDir)
  })

  test('should throw error when path exists but is not a directory', async () => {
    // Mock path exists but is not a directory
    mockStat.mockResolvedValueOnce({
      isDirectory: () => false,
    } as never)

    await expect(checkDir(testDir)).rejects.toThrow(`Directory ${testDir} is not a directory`)

    expect(mockStat).toHaveBeenCalledTimes(1)
    expect(mockStat).toHaveBeenCalledWith(testDir)
  })

  test('should re-throw non-ENOENT errors when checking directory', async () => {
    const permissionError = new Error('Permission denied') as NodeJS.ErrnoException
    permissionError.code = 'EACCES'

    mockStat.mockRejectedValueOnce(permissionError)

    await expect(checkDir(testDir)).rejects.toThrow('Permission denied')

    expect(mockStat).toHaveBeenCalledTimes(1)
    expect(mockStat).toHaveBeenCalledWith(testDir)
  })

  test('should throw error when index.html does not exist', async () => {
    // Mock directory exists and is a directory
    mockStat.mockResolvedValueOnce({
      isDirectory: () => true,
    } as never)

    // Mock index.html does not exist
    const enoentError = new Error('ENOENT') as NodeJS.ErrnoException
    enoentError.code = 'ENOENT'
    mockStat.mockRejectedValueOnce(enoentError)

    const expectedError = [
      `"${testDir}/index.html" does not exist -`,
      '[SOURCE_DIR] must be a directory containing',
      'a Sanity studio built using "sanity build"',
    ].join(' ')

    await expect(checkDir(testDir)).rejects.toThrow(expectedError)

    expect(mockStat).toHaveBeenCalledTimes(2)
    expect(mockStat).toHaveBeenNthCalledWith(1, testDir)
    expect(mockStat).toHaveBeenNthCalledWith(2, join(testDir, 'index.html'))
  })

  test('should re-throw non-ENOENT errors when checking index.html', async () => {
    // Mock directory exists and is a directory
    mockStat.mockResolvedValueOnce({
      isDirectory: () => true,
    } as never)

    // Mock permission error when checking index.html
    const permissionError = new Error('Permission denied') as NodeJS.ErrnoException
    permissionError.code = 'EACCES'
    mockStat.mockRejectedValueOnce(permissionError)

    await expect(checkDir(testDir)).rejects.toThrow('Permission denied')

    expect(mockStat).toHaveBeenCalledTimes(2)
    expect(mockStat).toHaveBeenNthCalledWith(1, testDir)
    expect(mockStat).toHaveBeenNthCalledWith(2, join(testDir, 'index.html'))
  })

  test('should handle relative paths correctly', async () => {
    const relativeDir = './relative/path'

    // Mock directory exists and is a directory
    mockStat.mockResolvedValueOnce({
      isDirectory: () => true,
    } as never)

    // Mock index.html exists
    mockStat.mockResolvedValueOnce({} as never)

    await expect(checkDir(relativeDir)).resolves.toBeUndefined()

    expect(mockStat).toHaveBeenCalledTimes(2)
    expect(mockStat).toHaveBeenNthCalledWith(1, relativeDir)
    expect(mockStat).toHaveBeenNthCalledWith(2, join(relativeDir, 'index.html'))
  })

  test('should handle errors without code property', async () => {
    // Mock error without code property when checking directory
    const genericError = new Error('Generic error')
    mockStat.mockRejectedValueOnce(genericError)

    await expect(checkDir(testDir)).rejects.toThrow('Generic error')

    expect(mockStat).toHaveBeenCalledTimes(1)
    expect(mockStat).toHaveBeenCalledWith(testDir)
  })

  test('should handle errors without code property when checking index.html', async () => {
    // Mock directory exists and is a directory
    mockStat.mockResolvedValueOnce({
      isDirectory: () => true,
    } as never)

    // Mock error without code property when checking index.html
    const genericError = new Error('Generic error')
    mockStat.mockRejectedValueOnce(genericError)

    await expect(checkDir(testDir)).rejects.toThrow('Generic error')

    expect(mockStat).toHaveBeenCalledTimes(2)
    expect(mockStat).toHaveBeenNthCalledWith(1, testDir)
    expect(mockStat).toHaveBeenNthCalledWith(2, join(testDir, 'index.html'))
  })

  describe('workbench (federation) builds', () => {
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

    test('should pass when manifest, remote entry, and all exposed assets exist', async () => {
      mockSourceDirExists()
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validManifest))
      // remote-entry.js, assets/panel.js, assets/panel.css
      mockStat.mockResolvedValue({} as never)

      await expect(checkDir(testDir, {isWorkbenchApp: true})).resolves.toBeUndefined()

      expect(mockReadFile).toHaveBeenCalledWith(manifestPath, 'utf8')
      expect(mockStat).toHaveBeenCalledWith(join(testDir, 'remote-entry.js'))
      expect(mockStat).toHaveBeenCalledWith(join(testDir, 'assets/panel.js'))
      expect(mockStat).toHaveBeenCalledWith(join(testDir, 'assets/panel.css'))
      // never falls through to the index.html check
      expect(mockStat).not.toHaveBeenCalledWith(join(testDir, 'index.html'))
    })

    test('should throw when mf-manifest.json does not exist', async () => {
      mockSourceDirExists()
      mockReadFile.mockRejectedValueOnce(enoent())

      await expect(checkDir(testDir, {isWorkbenchApp: true})).rejects.toThrow(
        `"${manifestPath}" does not exist`,
      )
    })

    test('should throw when mf-manifest.json is not valid JSON', async () => {
      mockSourceDirExists()
      mockReadFile.mockResolvedValueOnce('not json{')

      await expect(checkDir(testDir, {isWorkbenchApp: true})).rejects.toThrow(
        `"${manifestPath}" is not valid JSON`,
      )
    })

    test('should throw when manifest does not declare a remote entry', async () => {
      mockSourceDirExists()
      mockReadFile.mockResolvedValueOnce(JSON.stringify({...validManifest, metaData: {}}))

      await expect(checkDir(testDir, {isWorkbenchApp: true})).rejects.toThrow(
        'does not declare a remote entry',
      )
    })

    test('should throw when manifest declares no exposed modules', async () => {
      mockSourceDirExists()
      mockReadFile.mockResolvedValueOnce(JSON.stringify({...validManifest, exposes: []}))

      await expect(checkDir(testDir, {isWorkbenchApp: true})).rejects.toThrow(
        'declares no exposed modules',
      )
    })

    test('should throw and name every file the manifest references but is missing', async () => {
      mockSourceDirExists()
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validManifest))
      // remote-entry.js exists, both panel assets are missing
      mockStat.mockResolvedValueOnce({} as never)
      mockStat.mockRejectedValueOnce(enoent())
      mockStat.mockRejectedValueOnce(enoent())

      await expect(checkDir(testDir, {isWorkbenchApp: true})).rejects.toThrow(
        'references files that are missing from the build: assets/panel.js, assets/panel.css',
      )
    })

    test('should re-throw non-ENOENT errors when checking referenced files', async () => {
      mockSourceDirExists()
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validManifest))

      const permissionError = new Error('Permission denied') as NodeJS.ErrnoException
      permissionError.code = 'EACCES'
      mockStat.mockRejectedValueOnce(permissionError)

      await expect(checkDir(testDir, {isWorkbenchApp: true})).rejects.toThrow('Permission denied')
    })
  })
})
