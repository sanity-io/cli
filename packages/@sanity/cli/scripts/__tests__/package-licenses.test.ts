import {existsSync} from 'node:fs'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {afterEach, beforeEach, expect, test} from 'vitest'

import {consolidateLicenses} from '../package-licenses.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cli-licenses-test-'))
})

afterEach(async () => {
  await rm(root, {force: true, recursive: true})
})

async function write(path: string, contents: object | string) {
  const file = join(root, path)
  await mkdir(dirname(file), {recursive: true})
  await writeFile(file, typeof contents === 'string' ? contents : JSON.stringify(contents))
}

test('moves notices of fully bundled packages into one file', async () => {
  const modules = 'dist/node_modules'
  await write(`${modules}/bundled/package.json`, {
    license: 'MIT',
    name: 'bundled',
    version: '1.0.0',
  })
  await write(`${modules}/bundled/LICENSE`, 'MIT license text')
  await write(`${modules}/bundled/dist/esm/package.json`, {type: 'module'})
  await write(`${modules}/@scope/pkg/package.json`, {name: '@scope/pkg', version: '2.0.0'})
  await write(`${modules}/@scope/pkg/NOTICE.md`, 'Notice text')
  await write(`${modules}/@scope/pkg/node_modules/nested/package.json`, {
    name: 'nested',
    version: '3.0.0',
  })
  await write(`${modules}/typed/package.json`, {name: 'typed', version: '1.0.0'})
  await write(`${modules}/typed/LICENSE`, 'Typed license')
  await write(`${modules}/typed/index.d.ts`, 'export {}')
  await write(`${modules}/reader/package.json`, {name: 'reader', version: '1.0.0'})

  expect(await consolidateLicenses(root, [`${modules}/reader`])).toEqual({packages: 3})

  const licenses = await readFile(join(root, 'dist/THIRD-PARTY-LICENSES.md'), 'utf8')
  expect(licenses).toContain('## @scope/pkg@2.0.0\n\n### NOTICE.md\n\n```\nNotice text\n```')
  expect(licenses).toContain(
    '## bundled@1.0.0\n\nLicense: MIT\n\n### LICENSE\n\n```\nMIT license text\n```',
  )
  expect(licenses).toContain('## nested@3.0.0')
  expect(licenses).not.toContain('typed')
  expect(existsSync(join(root, modules, 'bundled'))).toBe(false)
  expect(existsSync(join(root, modules, '@scope'))).toBe(false)
  expect(existsSync(join(root, modules, 'typed/LICENSE'))).toBe(true)
  expect(existsSync(join(root, modules, 'reader/package.json'))).toBe(true)
})

test('does nothing without bundled dependencies', async () => {
  expect(await consolidateLicenses(root, [])).toEqual({packages: 0})
})
