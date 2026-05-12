import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {copyDir, skipIfExistsError} from '../copyDir'

let workDir: string

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copydir-test-'))
})

afterEach(async () => {
  await fs.rm(workDir, {recursive: true, force: true})
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
    const src = path.join(workDir, 'src')
    const dest = path.join(workDir, 'nested', 'dest')

    await fs.mkdir(src, {recursive: true})
    await fs.writeFile(path.join(src, 'file.txt'), 'hello')

    await copyDir(src, dest)

    const destStat = await fs.stat(dest)
    expect(destStat.isDirectory()).toBe(true)
    expect(await fs.readFile(path.join(dest, 'file.txt'), 'utf8')).toBe('hello')
  })

  test('copies files from source to destination', async () => {
    const src = path.join(workDir, 'src')
    const dest = path.join(workDir, 'dest')

    await fs.mkdir(src, {recursive: true})
    await fs.writeFile(path.join(src, 'a.txt'), 'A')
    await fs.writeFile(path.join(src, 'b.txt'), 'B')

    await copyDir(src, dest)

    expect(await fs.readFile(path.join(dest, 'a.txt'), 'utf8')).toBe('A')
    expect(await fs.readFile(path.join(dest, 'b.txt'), 'utf8')).toBe('B')
  })

  test('recursively copies subdirectories', async () => {
    const src = path.join(workDir, 'src')
    const dest = path.join(workDir, 'dest')

    await fs.mkdir(path.join(src, 'sub', 'deeper'), {recursive: true})
    await fs.writeFile(path.join(src, 'top.txt'), 'top')
    await fs.writeFile(path.join(src, 'sub', 'mid.txt'), 'mid')
    await fs.writeFile(path.join(src, 'sub', 'deeper', 'bottom.txt'), 'bottom')

    await copyDir(src, dest)

    expect(await fs.readFile(path.join(dest, 'top.txt'), 'utf8')).toBe('top')
    expect(await fs.readFile(path.join(dest, 'sub', 'mid.txt'), 'utf8')).toBe('mid')
    expect(await fs.readFile(path.join(dest, 'sub', 'deeper', 'bottom.txt'), 'utf8')).toBe('bottom')
  })

  test('returns silently when source directory does not exist', async () => {
    const src = path.join(workDir, 'missing')
    const dest = path.join(workDir, 'dest')

    await expect(copyDir(src, dest)).resolves.toBeUndefined()

    // Destination is still created
    const destStat = await fs.stat(dest)
    expect(destStat.isDirectory()).toBe(true)

    const entries = await fs.readdir(dest)
    expect(entries).toEqual([])
  })

  test('overwrites existing files when skipExisting is not set', async () => {
    const src = path.join(workDir, 'src')
    const dest = path.join(workDir, 'dest')

    await fs.mkdir(src, {recursive: true})
    await fs.mkdir(dest, {recursive: true})
    await fs.writeFile(path.join(src, 'file.txt'), 'new')
    await fs.writeFile(path.join(dest, 'file.txt'), 'old')

    await copyDir(src, dest)

    expect(await fs.readFile(path.join(dest, 'file.txt'), 'utf8')).toBe('new')
  })

  test('does not overwrite existing files when skipExisting is true', async () => {
    const src = path.join(workDir, 'src')
    const dest = path.join(workDir, 'dest')

    await fs.mkdir(src, {recursive: true})
    await fs.mkdir(dest, {recursive: true})
    await fs.writeFile(path.join(src, 'existing.txt'), 'new')
    await fs.writeFile(path.join(src, 'fresh.txt'), 'fresh')
    await fs.writeFile(path.join(dest, 'existing.txt'), 'old')

    await copyDir(src, dest, true)

    // Existing file is preserved
    expect(await fs.readFile(path.join(dest, 'existing.txt'), 'utf8')).toBe('old')
    // New file is copied
    expect(await fs.readFile(path.join(dest, 'fresh.txt'), 'utf8')).toBe('fresh')
  })

  test('skips entries where srcFile resolves to destDir', async () => {
    // When the destination directory is nested inside the source directory,
    // copyDir should skip the destination to avoid infinite recursion.
    const src = path.join(workDir, 'src')
    const dest = path.join(src, 'dest')

    await fs.mkdir(src, {recursive: true})
    await fs.mkdir(dest, {recursive: true})
    await fs.writeFile(path.join(src, 'file.txt'), 'content')

    await copyDir(src, dest)

    expect(await fs.readFile(path.join(dest, 'file.txt'), 'utf8')).toBe('content')
    // The dest should not contain a nested copy of itself
    const nestedDest = path.join(dest, 'dest')
    await expect(fs.stat(nestedDest)).rejects.toMatchObject({code: 'ENOENT'})
  })

  test('rejects when source is not a directory', async () => {
    const src = path.join(workDir, 'src')
    const dest = path.join(workDir, 'dest')

    // Source is a file, not a directory — readdir will throw ENOTDIR.
    await fs.writeFile(src, 'not-a-dir')

    await expect(copyDir(src, dest)).rejects.toMatchObject({code: 'ENOTDIR'})
  })

  test('rejects when destination cannot be created', async () => {
    const src = path.join(workDir, 'src')
    const dest = path.join(workDir, 'dest')

    await fs.mkdir(src, {recursive: true})
    await fs.writeFile(path.join(src, 'file.txt'), 'data')

    // Pre-create dest as a regular file so the initial mkdir(dest, {recursive: true})
    // fails because the path exists but is not a directory.
    await fs.writeFile(dest, 'not-a-dir')

    await expect(copyDir(src, dest)).rejects.toThrow()
  })
})
