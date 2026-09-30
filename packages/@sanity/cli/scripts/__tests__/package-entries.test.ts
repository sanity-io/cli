import {mkdir, mkdtemp, realpath, rm, symlink, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {afterEach, beforeEach, expect, test} from 'vitest'

import {findBundleEntries} from '../package-entries.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cli-entries-test-'))
})

afterEach(async () => {
  await rm(root, {force: true, recursive: true})
})

async function write(path: string, contents: object | string) {
  const file = join(root, path)
  await mkdir(dirname(file), {recursive: true})
  await writeFile(file, typeof contents === 'string' ? contents : JSON.stringify(contents))
}

test('finds the bin entry, public exports and every oclif module loaded by path', async () => {
  const oclif = await realpath(
    dirname(createRequire(import.meta.url).resolve('@oclif/core/package.json')),
  )
  await mkdir(join(root, 'dist/node_modules/@oclif'), {recursive: true})
  await symlink(oclif, join(root, 'dist/node_modules/@oclif/core'))

  await write('package.json', {
    exports: {
      '.': {default: './dist/exports/index.js', source: './src/exports/index.ts'},
      './package.json': './package.json',
    },
    name: 'fixture-cli',
    oclif: {
      bin: 'fixture',
      commands: './dist/commands',
      helpClass: './dist/help',
      hooks: {init: ['./dist/hooks/init.js'], prerun: './dist/hooks/prerun'},
    },
    type: 'module',
    version: '1.0.0',
  })
  await write('bin/run.js', "import '../dist/entry/run.js'")
  await write('dist/package.json', {dependencies: {'fixture-plugin': '1.0.0'}, type: 'module'})
  await write('dist/entry/run.js', '')
  await write('dist/exports/index.js', 'export {}')
  await write('dist/help.js', 'export default class Help {}')
  await write('dist/hooks/init.js', 'export default async function () {}')
  await write('dist/hooks/prerun.js', 'export default async function () {}')
  await write(
    'dist/commands/hello.js',
    "import {Command} from '@oclif/core'\nexport default class Hello extends Command { async run() {} }",
  )
  await write(
    'dist/util/pluginAdditions.js',
    `import {fileURLToPath} from 'node:url'
export function getPluginAdditions(manifest) {
  return {pluginAdditions: {core: ['fixture-plugin'], path: fileURLToPath(new URL('.', manifest))}}
}`,
  )
  await write('dist/node_modules/fixture-plugin/package.json', {
    exports: {'.': {import: './lib/index.js'}},
    name: 'fixture-plugin',
    oclif: {commands: './lib/commands'},
    type: 'module',
    version: '1.0.0',
  })
  await write('dist/node_modules/fixture-plugin/lib/index.js', 'export {}')
  await write(
    'dist/node_modules/fixture-plugin/lib/commands/plugin.js',
    "import {Command} from '@oclif/core'\nexport default class Plugin extends Command { async run() {} }",
  )

  expect(await findBundleEntries(root)).toEqual([
    'dist/commands/hello.js',
    'dist/entry/run.js',
    'dist/exports/index.js',
    'dist/help.js',
    'dist/hooks/init.js',
    'dist/hooks/prerun.js',
    'dist/node_modules/fixture-plugin/lib/commands/plugin.js',
    'dist/node_modules/fixture-plugin/lib/index.js',
  ])
})
