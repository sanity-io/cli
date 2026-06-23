import {constants as fsConstants} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {copyDir, skipIfExistsError} from '../copyDir'

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    copyFile: vi.fn(),
  },
}))

const mkdir = vi.mocked(fs.mkdir)
const readdir = vi.mocked(fs.readdir)
const stat = vi.mocked(fs.stat)
const copyFile = vi.mocked(fs.copyFile)

function fileStat() {
  return {isDirectory: () => false, isFile: () => true} as Awaited<ReturnType<typeof fs.stat>>
}

function dirStat() {
  return {isDirectory: () => true, isFile: () => false} as Awaited<ReturnType<typeof fs.stat>>
}

function fsError(code: string): Error & {code: string} {
  const err = new Error(code) as Error & {code: string}
  err.code = code
  return err
}

beforeEach(() => {
  // Safe defaults: mkdir/copyFile succeed, source dirs are empty, all entries are files.
  mkdir.mockResolvedValue(undefined)
  readdir.mockResolvedValue([])
  stat.mockResolvedValue(fileStat())
  copyFile.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#skipIfExistsError', () => {
  test('returns undefined when error code is EEXIST', () => {
    const err = Object.assign(new Error('file exists'), {code: 'EEXIST'})
    expect(() => skipIfExistsError(err)).not.toThrow()
    expect(skipIfExistsError(err)).toBeUndefined()
  })

  test('rethrows when error code is not EEXIST', () => {
    const err = Object.assign(new Error('permission denied'), {code: 'EACCES'})
    expect(() => skipIfExistsError(err)).toThrow('permission denied')
  })

  test('rethrows when error has no code', () => {
    const err = Object.assign(new Error('boom'), {code: undefined as unknown as string})
    expect(() => skipIfExistsError(err)).toThrow('boom')
  })
})

describe('#copyDir', () => {
  test('creates destination directory when it does not exist', async () => {
    const src = '/src'
    const dest = '/nested/dest'

    readdir.mockResolvedValue(['file.txt'] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
    stat.mockResolvedValue(fileStat())

    await copyDir(src, dest)

    expect(mkdir).toHaveBeenCalledWith(dest, {recursive: true})
    expect(copyFile).toHaveBeenCalledWith(path.resolve(src, 'file.txt'), path.resolve(dest, 'file.txt'))
  })

  test('copies files from source to destination', async () => {
    const src = '/src'
    const dest = '/dest'

    readdir.mockResolvedValue(['a.txt', 'b.txt'] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
    stat.mockResolvedValue(fileStat())

    await copyDir(src, dest)

    expect(copyFile).toHaveBeenCalledTimes(2)
    expect(copyFile).toHaveBeenCalledWith(path.resolve(src, 'a.txt'), path.resolve(dest, 'a.txt'))
    expect(copyFile).toHaveBeenCalledWith(path.resolve(src, 'b.txt'), path.resolve(dest, 'b.txt'))
  })

  test('recursively copies subdirectories', async () => {
    const src = '/src'
    const dest = '/dest'
    const subSrc = path.join(src, 'sub')
    const deeperSrc = path.join(subSrc, 'deeper')

    readdir.mockImplementation(async (dir) => {
      if (dir === src) return ['top.txt', 'sub'] as never
      if (dir === subSrc) return ['mid.txt', 'deeper'] as never
      if (dir === deeperSrc) return ['bottom.txt'] as never
      return [] as never
    })

    stat.mockImplementation(async (p) => {
      if (p === subSrc || p === deeperSrc) return dirStat()
      return fileStat()
    })

    await copyDir(src, dest)

    // Destination directory and every nested destination directory are created.
    expect(mkdir).toHaveBeenCalledWith(dest, {recursive: true})
    expect(mkdir).toHaveBeenCalledWith(path.join(dest, 'sub'), {recursive: true})
    expect(mkdir).toHaveBeenCalledWith(path.join(dest, 'sub', 'deeper'), {recursive: true})

    // Every file in the tree is copied.
    expect(copyFile).toHaveBeenCalledWith(path.join(src, 'top.txt'), path.join(dest, 'top.txt'))
    expect(copyFile).toHaveBeenCalledWith(
      path.join(subSrc, 'mid.txt'),
      path.join(dest, 'sub', 'mid.txt'),
    )
    expect(copyFile).toHaveBeenCalledWith(
      path.join(deeperSrc, 'bottom.txt'),
      path.join(dest, 'sub', 'deeper', 'bottom.txt'),
    )
    expect(copyFile).toHaveBeenCalledTimes(3)
  })

  test('returns silently when source directory does not exist', async () => {
    const src = '/missing'
    const dest = '/dest'

    readdir.mockRejectedValue(fsError('ENOENT'))

    await expect(copyDir(src, dest)).resolves.toBeUndefined()

    // Destination is still created.
    expect(mkdir).toHaveBeenCalledWith(dest, {recursive: true})
    // No files are copied.
    expect(copyFile).not.toHaveBeenCalled()
  })

  test('overwrites existing files when skipExisting is not set', async () => {
    const src = '/src'
    const dest = '/dest'

    readdir.mockResolvedValue(['file.txt'] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
    stat.mockResolvedValue(fileStat())

    await copyDir(src, dest)

    // copyFile is called without the COPYFILE_EXCL flag, so existing files are overwritten.
    expect(copyFile).toHaveBeenCalledWith(path.resolve(src, 'file.txt'), path.resolve(dest, 'file.txt'))
    expect(copyFile).toHaveBeenCalledTimes(1)
    // Sanity check: no flag argument was passed.
    expect(copyFile.mock.calls[0]).toHaveLength(2)
  })

  test('does not overwrite existing files when skipExisting is true', async () => {
    const src = '/src'
    const dest = '/dest'

    readdir.mockResolvedValue([
      'existing.txt',
      'fresh.txt',
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
    stat.mockResolvedValue(fileStat())

    // Simulate the destination file already existing for the first entry.
    copyFile.mockImplementationOnce(async () => {
      throw fsError('EEXIST')
    })

    await copyDir(src, dest, true)

    // copyFile is invoked with the COPYFILE_EXCL flag for both entries.
    expect(copyFile).toHaveBeenCalledWith(
      path.resolve(src, 'existing.txt'),
      path.resolve(dest, 'existing.txt'),
      fsConstants.COPYFILE_EXCL,
    )
    expect(copyFile).toHaveBeenCalledWith(
      path.resolve(src, 'fresh.txt'),
      path.resolve(dest, 'fresh.txt'),
      fsConstants.COPYFILE_EXCL,
    )
    expect(copyFile).toHaveBeenCalledTimes(2)
  })

  test('rethrows non-EEXIST errors when skipExisting is true', async () => {
    const src = '/src'
    const dest = '/dest'

    readdir.mockResolvedValue(['file.txt'] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
    stat.mockResolvedValue(fileStat())
    copyFile.mockRejectedValueOnce(fsError('EACCES'))

    await expect(copyDir(src, dest, true)).rejects.toMatchObject({code: 'EACCES'})
  })

  test('skips entries where srcFile resolves to destDir', async () => {
    // When the destination directory is nested inside the source directory,
    // copyDir should skip the destination to avoid infinite recursion.
    const src = '/src'
    const dest = path.join(src, 'dest')

    readdir.mockResolvedValue(['file.txt', 'dest'] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
    stat.mockResolvedValue(fileStat())

    await copyDir(src, dest)

    // Only the non-dest entry is copied.
    expect(copyFile).toHaveBeenCalledTimes(1)
    expect(copyFile).toHaveBeenCalledWith(path.resolve(src, 'file.txt'), path.resolve(dest, 'file.txt'))
    // stat is never called for the dest entry because the `srcFile === destDir`
    // check short-circuits the loop body first.
    expect(stat).toHaveBeenCalledTimes(1)
    expect(stat).toHaveBeenCalledWith(path.resolve(src, 'file.txt'))
  })

  test('rejects when source is not a directory', async () => {
    const src = '/src'
    const dest = '/dest'

    // Source is a file, not a directory — readdir throws ENOTDIR, which is not
    // caught by tryReadDir and therefore propagates.
    readdir.mockRejectedValue(fsError('ENOTDIR'))

    await expect(copyDir(src, dest)).rejects.toMatchObject({code: 'ENOTDIR'})
  })

  test('rejects when destination cannot be created', async () => {
    const src = '/src'
    const dest = '/dest'

    mkdir.mockRejectedValue(fsError('ENOTDIR'))

    await expect(copyDir(src, dest)).rejects.toMatchObject({code: 'ENOTDIR'})
    // The failure happens before readdir is attempted.
    expect(readdir).not.toHaveBeenCalled()
  })
})
