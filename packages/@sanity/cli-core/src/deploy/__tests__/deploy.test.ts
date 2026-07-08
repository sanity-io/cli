import {type Dirent, type Stats} from 'node:fs'
import {readdir, stat} from 'node:fs/promises'
import {join} from 'node:path'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {type Output} from '../../types.js'
import {listDeploymentFiles} from '../adapter.js'
import {enforce, getCoreAppUrl} from '../checks.js'

vi.mock(import('node:fs/promises'), async (importOriginal) => ({
  ...(await importOriginal()),
  readdir: vi.fn(),
  stat: vi.fn(),
}))

const mockReaddir = vi.mocked(readdir)
const mockStat = vi.mocked(stat)

const mockOutput = () => ({error: vi.fn(), warn: vi.fn()}) as unknown as Output

describe('enforce', () => {
  test('a fail exits with its exit code', () => {
    const output = mockOutput()
    enforce(output, {exitCode: 2, message: 'boom', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom', {exit: 2})
  })

  test('a fail without an exit code defaults to 1', () => {
    const output = mockOutput()
    enforce(output, {message: 'boom', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom', {exit: 1})
  })

  test('a warn prints and does not exit', () => {
    const output = mockOutput()
    enforce(output, {message: 'heads up', status: 'warn'})
    expect(output.warn).toHaveBeenCalledWith('heads up')
    expect(output.error).not.toHaveBeenCalled()
  })

  test('pass and skip are silent', () => {
    const output = mockOutput()
    enforce(output, {message: 'good', status: 'pass'})
    enforce(output, {message: 'skipped', status: 'skip'})
    expect(output.error).not.toHaveBeenCalled()
    expect(output.warn).not.toHaveBeenCalled()
  })

  test('a fail appends its solution to the message', () => {
    const output = mockOutput()
    enforce(output, {message: 'boom', solution: 'do X', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom: do X', {exit: 1})
  })

  test('a warn appends its solution to the message', () => {
    const output = mockOutput()
    enforce(output, {message: 'heads up', solution: 'do Y', status: 'warn'})
    expect(output.warn).toHaveBeenCalledWith('heads up: do Y')
  })
})

describe('getCoreAppUrl', () => {
  test('builds the dashboard URL from organization and application', () => {
    expect(getCoreAppUrl('org-1', 'app-1')).toMatch(/\/@org-1\/application\/app-1$/)
  })
})

// Minimal Dirent stand-in: listDeploymentFiles only reads `name` and `isDirectory()`.
const dirent = (name: string, isDirectory: boolean): Dirent =>
  ({isDirectory: () => isDirectory, name}) as Dirent

describe('listDeploymentFiles', () => {
  beforeEach(() => vi.clearAllMocks())

  test('lists nested files as sorted paths with sizes, relative to fromDir', async () => {
    mockReaddir.mockImplementation((async (dir: string) => {
      if (dir.endsWith(join('dist', 'assets'))) return [dirent('app.js', false)]
      if (dir.endsWith('dist')) return [dirent('index.html', false), dirent('assets', true)]
      return []
    }) as unknown as typeof readdir)
    mockStat.mockImplementation(
      (async (file: string) =>
        ({size: file.endsWith('app.js') ? 3 : 1}) as Stats) as unknown as typeof stat,
    )

    const files = await listDeploymentFiles(join('/root', 'dist'), '/root')

    expect(files).toEqual([
      {path: 'dist/assets/app.js', size: 3},
      {path: 'dist/index.html', size: 1},
    ])
  })

  test('returns an empty list when the directory is missing', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'))
    expect(await listDeploymentFiles(join('/root', 'missing'), '/root')).toEqual([])
  })
})
