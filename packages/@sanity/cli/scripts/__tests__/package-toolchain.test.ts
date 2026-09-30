import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

import {doImport} from '@sanity/cli-core/util'
import {expect, test} from 'vitest'

import {prepareToolchain} from '../package-toolchain.js'

test('native adapters use the cache, preserve exports and assets, and pin the complete toolchain', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cli-adapter-test-'))
  try {
    const stage = join(root, 'deploy')
    const output = join(root, 'package')
    const pkg = join(stage, 'node_modules/vite')
    await mkdir(pkg, {recursive: true})
    await writeFile(
      join(pkg, 'package.json'),
      JSON.stringify({
        exports: {
          '.': './index.js',
          './module-runner': './runner.js',
          './types-only': {types: './index.d.ts'},
          './types/*': './types/*',
        },
        name: 'vite',
        type: 'module',
        version: '8.3.0',
      }),
    )
    await writeFile(
      join(pkg, 'index.js'),
      'export const value = "stage"; export default "stage-default";',
    )
    await writeFile(join(pkg, 'runner.js'), 'export const value = "stage-runner";')
    await writeFile(join(pkg, 'index.js.map'), '{}')
    await writeFile(join(pkg, 'index.d.ts'), 'export declare const value: string;')
    await writeFile(join(pkg, 'LICENSE'), 'License text')
    const helper = join(output, 'dist/util')
    await mkdir(helper, {recursive: true})
    await writeFile(
      join(helper, 'toolchain.js'),
      'export async function loadToolchainModule(specifier, versions) { return {value: [specifier, versions.vite], default: "cached-default"} }',
    )
    await writeFile(join(output, 'package.json'), '{"type":"module"}')
    const dependencies = new Map([[pkg, {name: 'vite', version: '8.3.0'}]])
    await prepareToolchain(stage, output, dependencies)

    const bundled = join(output, 'dist/node_modules/vite')
    const library = await doImport(pathToFileURL(join(bundled, 'index.sanity-loader.mjs')).href)
    expect(library.value).toEqual(['vite', '8.3.0'])
    expect(library.default).toBe('cached-default')
    const runner = await doImport(pathToFileURL(join(bundled, 'runner.sanity-loader.mjs')).href)
    expect(runner.value).toEqual(['vite/module-runner', '8.3.0'])
    expect(await readFile(join(bundled, 'LICENSE'), 'utf8')).toBe('License text')
    expect(await readFile(join(bundled, 'index.d.ts'), 'utf8')).toContain('value: string')
    expect(
      JSON.parse(await readFile(join(bundled, 'package.json'), 'utf8')).exports['.'].types,
    ).toBe('./index.d.ts')
    expect(
      Object.keys(
        JSON.parse(await readFile(join(bundled, 'package.json'), 'utf8')).exports['.'],
      )[0],
    ).toBe('types')
    await expect(readFile(join(bundled, 'index.js.map'))).rejects.toMatchObject({code: 'ENOENT'})
  } finally {
    await rm(root, {force: true, recursive: true})
  }
})

test('adapters isolate multiple exact versions and preserve CommonJS named exports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cli-adapter-versions-'))
  try {
    const stage = join(root, 'deploy')
    const output = join(root, 'package')
    const first = join(stage, 'node_modules/tool')
    const second = join(stage, 'node_modules/parent/node_modules/tool')
    for (const [path, version] of [
      [first, '1.0.0'],
      [second, '2.0.0'],
    ]) {
      await mkdir(path, {recursive: true})
      await writeFile(
        join(path, 'package.json'),
        JSON.stringify({main: 'index.js', name: 'tool', version}),
      )
      await writeFile(join(path, 'index.js'), 'exports.execute = () => "original";')
    }
    await mkdir(join(output, 'dist/util'), {recursive: true})
    await writeFile(join(output, 'package.json'), '{"type":"module"}')
    await writeFile(
      join(output, 'dist/util/toolchain.js'),
      'export async function loadToolchainModule(specifier, versions) { return {execute: () => versions[specifier], default: {specifier}}; }',
    )
    await prepareToolchain(
      stage,
      output,
      new Map([
        [first, {name: 'tool', version: '1.0.0'}],
        [second, {name: 'tool', version: '2.0.0'}],
      ]),
    )
    const a = await doImport(
      pathToFileURL(join(output, 'dist/node_modules/tool/index.sanity-loader.mjs')).href,
    )
    const b = await doImport(
      pathToFileURL(
        join(output, 'dist/node_modules/parent/node_modules/tool/index.sanity-loader.mjs'),
      ).href,
    )
    expect(a.execute()).toBe('1.0.0')
    expect(b.execute()).toBe('npm:tool@2.0.0')
    expect(a.default.specifier).toBe('tool')
    expect(b.default.specifier).toMatch(/^sanity-cli-tool-/)
    await expect(readFile(join(output, 'dist/node_modules/tool/index.js'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  } finally {
    await rm(root, {force: true, recursive: true})
  }
})
