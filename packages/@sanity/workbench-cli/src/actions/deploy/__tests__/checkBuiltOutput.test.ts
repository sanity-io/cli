import {stat} from 'node:fs/promises'
import {join} from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {checkBuiltOutput} from '../checkBuiltOutput.js'

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

describe('checkBuiltOutput', () => {
  const testDir = '/test/directory'
  const manifestPath = join(testDir, 'mf-manifest.json')

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('passes when the directory contains mf-manifest.json', async () => {
    mockSourceDirExists()
    mockStat.mockResolvedValueOnce({} as never)

    await expect(checkBuiltOutput(testDir)).resolves.toBeUndefined()

    expect(mockStat).toHaveBeenCalledTimes(2)
    expect(mockStat).toHaveBeenNthCalledWith(1, testDir)
    expect(mockStat).toHaveBeenNthCalledWith(2, manifestPath)
    // never checks for index.html — that contract belongs to the non-workbench checkDir
    expect(mockStat).not.toHaveBeenCalledWith(join(testDir, 'index.html'))
  })

  test('tags a missing directory as BUILD_NOT_FOUND', async () => {
    mockStat.mockRejectedValueOnce(enoent())

    const err = await checkBuiltOutput(testDir).catch((e) => e)

    expect(err.message).toContain(`Directory "${testDir}" does not exist`)
    expect(err.name).toBe('BUILD_NOT_FOUND')
    expect(mockStat).toHaveBeenCalledTimes(1)
  })

  test('throws when the path exists but is not a directory', async () => {
    mockStat.mockResolvedValueOnce({isDirectory: () => false} as never)

    await expect(checkBuiltOutput(testDir)).rejects.toThrow(`"${testDir}" is not a directory`)

    expect(mockStat).toHaveBeenCalledTimes(1)
  })

  test('re-throws non-ENOENT errors when checking the directory, untagged', async () => {
    const permissionError = new Error('Permission denied') as NodeJS.ErrnoException
    permissionError.code = 'EACCES'
    mockStat.mockRejectedValueOnce(permissionError)

    const err = await checkBuiltOutput(testDir).catch((e) => e)

    expect(err).toBe(permissionError)
    expect(err.name).not.toBe('BUILD_NOT_FOUND')
  })

  test('tags a missing mf-manifest.json as BUILD_NOT_FOUND', async () => {
    mockSourceDirExists()
    mockStat.mockRejectedValueOnce(enoent())

    const err = await checkBuiltOutput(testDir).catch((e) => e)

    expect(err.message).toContain(`"${manifestPath}" does not exist`)
    expect(err.name).toBe('BUILD_NOT_FOUND')
    expect(mockStat).toHaveBeenNthCalledWith(2, manifestPath)
  })

  test('re-throws non-ENOENT errors when checking the manifest, untagged', async () => {
    mockSourceDirExists()

    const permissionError = new Error('Permission denied') as NodeJS.ErrnoException
    permissionError.code = 'EACCES'
    mockStat.mockRejectedValueOnce(permissionError)

    const err = await checkBuiltOutput(testDir).catch((e) => e)

    expect(err).toBe(permissionError)
    expect(err.name).not.toBe('BUILD_NOT_FOUND')
  })
})
