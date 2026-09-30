import {existsSync} from 'node:fs'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {afterEach, beforeEach, expect, test} from 'vitest'

import {pruneDeclarations} from '../package-declarations.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cli-declarations-test-'))
})

afterEach(async () => {
  await rm(root, {force: true, recursive: true})
})

async function write(path: string, contents: object | string) {
  const file = join(root, path)
  await mkdir(dirname(file), {recursive: true})
  await writeFile(file, typeof contents === 'string' ? contents : JSON.stringify(contents))
}

test('keeps declarations the public types reach and removes the rest', async () => {
  await write(
    'dist/exports/index.d.ts',
    "/// <reference types=\"ref-types\" />\nexport type {A} from 'dual'\nexport type B = import('lazy').B",
  )
  await write('dist/exports/private.d.ts', 'export type Own = 1')
  await write('dist/node_modules/@types/ref-types/package.json', {name: '@types/ref-types'})
  await write('dist/node_modules/@types/ref-types/index.d.ts', 'declare const ref: 1')
  await write('dist/node_modules/dual/package.json', {
    exports: {
      '.': {import: './index.d.mts', require: './index.d.cts'},
    },
    name: 'dual',
  })
  await write('dist/node_modules/dual/index.d.mts', "export type {A} from './a.js'")
  await write('dist/node_modules/dual/a.d.ts', 'export type A = 1')
  await write('dist/node_modules/dual/index.d.cts', 'export type A = 1')
  await write('dist/node_modules/dual/src/index.ts', 'export type A = 1')
  await write('dist/node_modules/lazy/package.json', {name: 'lazy', types: 'types.d.ts'})
  await write('dist/node_modules/lazy/types.d.ts', 'export type B = 2')
  await write('dist/node_modules/unused/package.json', {name: 'unused'})
  await write('dist/node_modules/unused/index.d.ts', 'export type C = 3')

  await pruneDeclarations(root, ['dist/exports/index.d.ts'])

  for (const kept of [
    'dist/exports/private.d.ts',
    'dist/node_modules/@types/ref-types/index.d.ts',
    'dist/node_modules/dual/index.d.mts',
    'dist/node_modules/dual/a.d.ts',
    'dist/node_modules/dual/index.d.cts',
    'dist/node_modules/lazy/types.d.ts',
  ]) {
    expect(existsSync(join(root, kept)), kept).toBe(true)
  }
  expect(existsSync(join(root, 'dist/node_modules/dual/src/index.ts'))).toBe(false)
  expect(existsSync(join(root, 'dist/node_modules/unused/index.d.ts'))).toBe(false)
})

test('keeps both copies of a package installed at several paths', async () => {
  await write('dist/exports/index.d.ts', "export type {A} from 'a'\nexport type {B} from 'b'")
  for (const parent of ['dist', 'dist/node_modules/b']) {
    await write(`${parent}/node_modules/shared/package.json`, {name: 'shared', version: '1.0.0'})
    await write(`${parent}/node_modules/shared/index.d.ts`, 'export type S = 1')
  }
  await write('dist/node_modules/a/package.json', {name: 'a'})
  await write('dist/node_modules/a/index.d.ts', "export type {S as A} from 'shared'")
  await write('dist/node_modules/b/package.json', {name: 'b'})
  await write('dist/node_modules/b/index.d.ts', "export type {S as B} from 'shared'")

  await pruneDeclarations(root, ['dist/exports/index.d.ts'])

  expect(existsSync(join(root, 'dist/node_modules/shared/index.d.ts'))).toBe(true)
  expect(existsSync(join(root, 'dist/node_modules/b/node_modules/shared/index.d.ts'))).toBe(true)
})
