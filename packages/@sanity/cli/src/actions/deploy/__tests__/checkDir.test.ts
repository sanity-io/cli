import {stat} from 'node:fs/promises'
import {join} from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {checkDir} from '../checkDir.js'

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}))

const mockStat = vi.mocked(stat)

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
})
