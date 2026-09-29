import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {largestPackages, scanInstalledTree} from '../tree.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cold-start-tree-'))
})

afterEach(async () => {
  await rm(root, {force: true, recursive: true})
})

async function file(path: string, bytes: number | string) {
  const full = join(root, path)
  await mkdir(dirname(full), {recursive: true})
  await writeFile(full, typeof bytes === 'string' ? bytes : 'x'.repeat(bytes))
}

async function pkg(dir: string, name: string, version: string, extraBytes: number) {
  const manifest = JSON.stringify({name, version})
  await file(`${dir}/package.json`, manifest)
  await file(`${dir}/index.js`, extraBytes)
  return manifest.length + extraBytes
}

describe('scanInstalledTree', () => {
  test('counts scoped, nested and duplicate packages and their bytes', async () => {
    const a = await pkg('node_modules/a', 'a', '1.0.0', 100)
    const scoped = await pkg('node_modules/@s/b', '@s/b', '2.0.0', 50)
    const nested = await pkg('node_modules/a/node_modules/c', 'c', '1.0.0', 10)
    const duplicate = await pkg('node_modules/@s/b/node_modules/c', 'c', '1.0.0', 10)
    await file('node_modules/.package-lock.json', 999)
    await file('node_modules/not-a-package/readme.md', 5)
    await mkdir(join(root, 'node_modules/.bin'))
    await symlink('../a/index.js', join(root, 'node_modules/.bin/a'))
    await file('node_modules/stray-file', 3)

    expect(await scanInstalledTree(join(root, 'node_modules'))).toEqual({
      bytes: a + scoped + nested + duplicate,
      packageCount: 4,
      packages: {'@s/b@2.0.0': scoped, 'a@1.0.0': a, 'c@1.0.0': nested + duplicate},
    })
  })
})

describe('largestPackages', () => {
  test('lists the largest packages first', () => {
    const tree = {bytes: 0, packageCount: 0, packages: {'a@1': 10, 'b@1': 30, 'c@1': 30, 'd@1': 1}}
    expect(largestPackages(tree, 3)).toEqual([
      {bytes: 30, id: 'b@1'},
      {bytes: 30, id: 'c@1'},
      {bytes: 10, id: 'a@1'},
    ])
  })
})
