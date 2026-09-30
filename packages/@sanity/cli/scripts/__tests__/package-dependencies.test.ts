import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

import {doImport} from '@sanity/cli-core/util'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {type Manifest, prepareDependencies} from '../package-dependencies.js'

describe('packed production dependencies', () => {
  let root: string
  let stage: string
  let output: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cli-package-test-'))
    stage = join(root, 'deploy')
    output = join(root, 'package')
    await mkdir(stage, {recursive: true})
  })

  afterEach(async () => {
    await rm(root, {force: true, recursive: true})
  })

  async function fixture(manifest: Partial<Manifest> & {name: string}, parent = stage) {
    const path = join(parent, 'node_modules', manifest.name)
    await mkdir(path, {recursive: true})
    await writeFile(join(path, 'package.json'), JSON.stringify({version: '1.0.0', ...manifest}))
    await writeFile(join(path, 'index.js'), '/*! Keep the license */\nexport const value = 1;\n')
    await writeFile(join(path, 'index.js.map'), '{}')
    await writeFile(join(path, 'asset.json'), '{"runtime":true}')
    return path
  }

  test('keeps nested versions and runtime assets while compacting JS and retaining licenses', async () => {
    const parent = await fixture({dependencies: {child: '2.0.0'}, name: 'parent'})
    await fixture({name: 'child'})
    await fixture({name: 'child', version: '2.0.0'}, parent)
    const result = await prepareDependencies(stage, output, {child: '*', parent: '*'})

    expect(result).toEqual({dependencies: {}, optionalDependencies: {}})
    const bundled = join(output, 'dist/node_modules')
    expect(JSON.parse(await readFile(join(bundled, 'child/package.json'), 'utf8')).version).toBe(
      '1.0.0',
    )
    expect(
      JSON.parse(await readFile(join(bundled, 'parent/node_modules/child/package.json'), 'utf8'))
        .version,
    ).toBe('2.0.0')
    expect(await readFile(join(bundled, 'parent/asset.json'), 'utf8')).toBe('{"runtime":true}')
    expect(await readFile(join(bundled, 'parent/index.js'), 'utf8')).toContain('Keep the license')
    await expect(readFile(join(bundled, 'parent/index.js.map'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  test('leaves native wrappers, Vite and optional platform packages to the package manager', async () => {
    await fixture({
      dependencies: {native: '*', vite: '*'},
      name: 'parent',
      optionalDependencies: {fsevents: '*', missing: '*'},
    })
    await fixture({name: 'vite', version: '8.3.0'})
    await fixture({
      name: 'native',
      optionalDependencies: {'native-linux-x64': '*'},
      version: '2.0.0',
    })
    await fixture({name: 'fsevents', os: ['darwin'], version: '2.3.3'})
    expect(await prepareDependencies(stage, output, {parent: '*'})).toEqual({
      dependencies: {native: '2.0.0', vite: '8.3.0'},
      optionalDependencies: {fsevents: '2.3.3'},
    })
    await expect(
      readFile(join(output, 'dist/node_modules/vite/package.json')),
    ).rejects.toMatchObject({code: 'ENOENT'})
  })

  test('includes required peers and skips optional peers', async () => {
    await fixture({
      name: 'parent',
      peerDependencies: {optional: '*', required: '*'},
      peerDependenciesMeta: {optional: {optional: true}},
    })
    await fixture({name: 'required'})
    await fixture({name: 'optional'})
    await prepareDependencies(stage, output, {parent: '*'})
    expect(
      await readFile(join(output, 'dist/node_modules/required/package.json'), 'utf8'),
    ).toContain('required')
    await expect(
      readFile(join(output, 'dist/node_modules/optional/package.json')),
    ).rejects.toMatchObject({code: 'ENOENT'})
  })

  test('defers the complete tool dependency graph and preserves exact versions', async () => {
    const tool = await fixture({
      dependencies: {'missing-build-dependency': '*'},
      name: '@module-federation/vite',
      version: '1.22.1',
    })
    const tools = new Map()
    expect(
      await prepareDependencies(stage, output, {'@module-federation/vite': '*'}, tools),
    ).toEqual({dependencies: {}, optionalDependencies: {}})
    expect(tools.get(tool)).toEqual({name: '@module-federation/vite', version: '1.22.1'})
    await expect(
      readFile(join(output, 'dist/node_modules/@module-federation/vite/package.json')),
    ).rejects.toMatchObject({code: 'ENOENT'})
  })

  test('keeps the authentication client immediate and defers the workflow-specific client version', async () => {
    await fixture({name: '@sanity/client', version: '8.6.1'})
    const workflow = await fixture({
      dependencies: {'@sanity/client': '^7'},
      name: '@sanity/workflow-cli',
    })
    const client = await fixture({name: '@sanity/client', version: '7.27.0'}, workflow)
    const tools = new Map()
    await prepareDependencies(
      stage,
      output,
      {'@sanity/client': '*', '@sanity/workflow-cli': '*'},
      tools,
    )
    expect(
      JSON.parse(
        await readFile(join(output, 'dist/node_modules/@sanity/client/package.json'), 'utf8'),
      ).version,
    ).toBe('8.6.1')
    expect(tools.get(client)).toEqual({name: '@sanity/client', version: '7.27.0'})
    expect(tools.size).toBe(1)
  })

  test('fails on missing required dependencies', async () => {
    await expect(prepareDependencies(stage, output, {missing: '*'})).rejects.toThrow(
      'Missing production dependency missing',
    )
    await fixture({dependencies: {missing: '*'}, name: 'parent'})
    await expect(prepareDependencies(stage, output, {parent: '*'})).rejects.toThrow(
      'Missing missing required by parent',
    )
  })

  test('omits only the tar libraries’ Bare alternatives to Node built-ins', async () => {
    await fixture({
      dependencies: {'bare-fs': '*'},
      imports: {fs: {bare: 'bare-fs', default: 'fs'}},
      name: 'tar-stream',
    })
    await fixture({
      imports: {fs: {bare: 'bare-fs', default: 'fs'}, path: {bare: 'bare-path', default: 'path'}},
      name: 'tar-fs',
      optionalDependencies: {'bare-fs': '*', 'bare-path': '*'},
    })
    await prepareDependencies(stage, output, {'tar-fs': '*', 'tar-stream': '*'})
    await expect(
      readFile(join(output, 'dist/node_modules/bare-fs/package.json')),
    ).rejects.toMatchObject({code: 'ENOENT'})
    await fixture({dependencies: {'bare-fs': '*'}, name: 'consumer'})
    await fixture({name: 'bare-fs'})
    await prepareDependencies(stage, output, {consumer: '*'})
    expect(
      await readFile(join(output, 'dist/node_modules/bare-fs/package.json'), 'utf8'),
    ).toContain('bare-fs')
    await fixture({
      dependencies: {'bare-fs': '*'},
      imports: {fs: {default: 'bare-fs'}},
      name: 'tar-stream',
    })
    await prepareDependencies(stage, output, {'tar-stream': '*'})
    expect(
      await readFile(join(output, 'dist/node_modules/bare-fs/package.json'), 'utf8'),
    ).toContain('bare-fs')
  })

  test('rejects conflicting native versions', async () => {
    const parent = await fixture({dependencies: {native: '*'}, name: 'parent'})
    await fixture({cpu: ['x64'], name: 'native', version: '1.0.0'})
    await fixture({cpu: ['arm64'], name: 'native', version: '2.0.0'}, parent)
    await expect(prepareDependencies(stage, output, {native: '*', parent: '*'})).rejects.toThrow(
      'Conflicting native dependency versions',
    )
  })

  test('keeps Node CommonJS named exports discoverable', async () => {
    const pkg = await fixture({name: 'commonjs', type: 'commonjs'})
    await writeFile(
      join(pkg, 'index.js'),
      'Object.defineProperty(exports, "execute", {enumerable: true, get: function () { return () => 42; }});',
    )
    await prepareDependencies(stage, output, {commonjs: '*'})
    const library = await doImport(
      pathToFileURL(join(output, 'dist/node_modules/commonjs/index.js')).href,
    )
    expect(library.execute()).toBe(42)
  })

  test('compacts CommonJS only when Node can still discover its exports', async () => {
    const simple = await fixture({name: 'simple-cjs'})
    const code = 'exports.answer = function () {\n  return 42;\n};\n'
    await writeFile(join(simple, 'index.js'), code)
    const umd = await fixture({name: 'umd-cjs'})
    const wrapper =
      '(function (factory) { factory(require, exports); })(function (require, exports) { exports.answer = () => 42; });'
    await writeFile(join(umd, 'index.js'), wrapper)
    await prepareDependencies(stage, output, {'simple-cjs': '*', 'umd-cjs': '*'})
    const simplePath = join(output, 'dist/node_modules/simple-cjs/index.js')
    const umdPath = join(output, 'dist/node_modules/umd-cjs/index.js')
    expect((await readFile(simplePath, 'utf8')).length).toBeLessThan(code.length)
    expect(await readFile(umdPath, 'utf8')).toBe(wrapper)
    expect((await doImport(pathToFileURL(simplePath).href)).answer()).toBe(42)
    expect((await doImport(pathToFileURL(umdPath).href)).answer()).toBe(42)
  })

  test('omits RxJS development sources only when exports use compiled distributions', async () => {
    const path = await fixture({exports: {'.': './dist/index.js'}, name: 'rxjs'})
    await mkdir(join(path, 'src'))
    await mkdir(join(path, 'dist'))
    await writeFile(join(path, 'src/index.ts'), 'export const answer: number = 42')
    await writeFile(join(path, 'dist/index.js'), 'exports.answer = 42')
    await writeFile(join(path, 'dist/index.d.ts'), 'export declare const answer: number')
    await prepareDependencies(stage, output, {rxjs: '*'})
    const dest = join(output, 'dist/node_modules/rxjs')
    expect((await doImport(pathToFileURL(join(dest, 'dist/index.js')).href)).answer).toBe(42)
    expect(await readFile(join(dest, 'dist/index.d.ts'), 'utf8')).toContain('answer: number')
    await expect(readFile(join(dest, 'src/index.ts'))).rejects.toMatchObject({code: 'ENOENT'})
    await writeFile(
      join(path, 'package.json'),
      JSON.stringify({exports: {'.': './src/index.ts'}, name: 'rxjs', version: '1.0.0'}),
    )
    await prepareDependencies(stage, output, {rxjs: '*'})
    expect(await readFile(join(dest, 'src/index.ts'), 'utf8')).toContain('answer: number = 42')
  })

  test('promotes an optional native dependency when a required dependency also needs it', async () => {
    await fixture({name: 'optional-parent', optionalDependencies: {native: '*'}})
    await fixture({dependencies: {child: '*'}, name: 'required-parent'})
    await fixture({dependencies: {native: '*'}, name: 'child'})
    await fixture({name: 'native', os: ['darwin']})
    expect(
      await prepareDependencies(stage, output, {'optional-parent': '*', 'required-parent': '*'}),
    ).toEqual({dependencies: {native: '1.0.0'}, optionalDependencies: {}})
  })
})
