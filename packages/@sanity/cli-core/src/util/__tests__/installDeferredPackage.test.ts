import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {installDeferredPackage} from '../../installDeferredPackage.js'

const npm = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({execa: npm}))

let cacheDir: string

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'sanity-cli-package-test-'))
  npm.mockReset().mockImplementation(async (_command, _args, {cwd}: {cwd: string}) => {
    const directory = join(cwd, 'node_modules', '@sanity', 'fixture')
    await mkdir(directory, {recursive: true})
    await writeFile(join(directory, 'package.json'), JSON.stringify({version: '1.0.0'}))
  })
})

afterEach(async () => {
  await rm(cacheDir, {force: true, recursive: true})
})

const request = () => installDeferredPackage('@sanity/fixture', '1.0.0', {cacheDir})

test('shares the installation between simultaneous and later invocations', async () => {
  const [first, second] = await Promise.all([request(), request()])

  expect(second).toBe(first)
  expect(await request()).toBe(first)
  expect(npm).toHaveBeenCalledTimes(1)
  const manifest = await readFile(join(first, 'node_modules/@sanity/fixture/package.json'), 'utf8')
  expect(JSON.parse(manifest)).toEqual({version: '1.0.0'})
})

test('can retry a failed installation', async () => {
  npm.mockRejectedValueOnce(new Error('registry unavailable'))

  await expect(installDeferredPackage('@sanity/fixture', '1.0.0', {cacheDir})).rejects.toThrow(
    'registry unavailable',
  )
  await expect(installDeferredPackage('@sanity/fixture', '1.0.0', {cacheDir})).resolves.toContain(
    '1.0.0',
  )
  expect(npm).toHaveBeenCalledTimes(2)
})
