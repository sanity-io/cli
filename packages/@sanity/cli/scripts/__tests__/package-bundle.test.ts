import {existsSync} from 'node:fs'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {pathToFileURL} from 'node:url'

import {doImport} from '@sanity/cli-core/util'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {
  bundlePackage,
  commonJsExports,
  commonJsWrapper,
  findPathLiterals,
  findPathReferences,
  findRelativeImports,
  relocate,
  resolvePlaceholders,
} from '../package-bundle.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cli-bundle-test-'))
})

afterEach(async () => {
  await rm(root, {force: true, recursive: true})
})

async function write(path: string, contents: object | string) {
  const file = join(root, path)
  await mkdir(dirname(file), {recursive: true})
  await writeFile(file, typeof contents === 'string' ? contents : JSON.stringify(contents))
}

describe('source scanning', () => {
  test('finds files loaded with new URL()', () => {
    expect(
      findPathReferences(
        "new URL('./a.worker.js', import.meta.url); new URL(\"../b.mjs\", import.meta.url); new URL('c.json', import.meta.url)",
      ),
    ).toEqual(['./a.worker.js', '../b.mjs'])
  })

  test('finds relative static and dynamic imports', () => {
    expect(
      findRelativeImports(
        'import {a} from "../../util/toolchain.js"; await import("./b.mjs"); import "pkg"',
      ),
    ).toEqual(['../../util/toolchain.js', './b.mjs'])
  })

  test('finds path literals but not import or require specifiers', () => {
    expect(
      findPathLiterals(
        "import a from './a.js'; require('./b.js'); await import('./c.js'); r('../dist/babel.cjs'); join(dir, 'task.worker.js'); 'not a path'",
      ),
    ).toEqual(['../dist/babel.cjs', 'task.worker.js'])
  })
})

describe('relocate', () => {
  test('leaves code without location expressions untouched', async () => {
    expect(await relocate('export const a = 1', 'dist/a.js', false)).toBe('export const a = 1')
  })

  test('points ES module locations at the original file', async () => {
    const code = await relocate(
      "#!/usr/bin/env node\nconst s = 'import.meta.url'; export const url = import.meta.url, dir = import.meta.dirname",
      'dist/a.js',
      false,
    )
    expect(code.startsWith('#!/usr/bin/env node\nimport {fileURLToPath')).toBe(true)
    expect(code).toContain('"__SANITY_PACKAGE_URL__:dist/a.js"')
    expect(code).toContain('"import.meta.url"')
    expect(code).not.toMatch(/=\s*import\.meta\.url/)
  })

  test('points CommonJS locations at the original file', async () => {
    const code = await relocate('module.exports = __dirname + __filename', 'dist/a.cjs', true)
    expect(code).toContain('require("node:url").fileURLToPath')
    expect(code).not.toMatch(/=\s*__dirname/)
  })

  test('resolves placeholders relative to the output file', () => {
    const code = resolvePlaceholders(
      'import "__SANITY_PACKAGE_IMPORT__:dist/node_modules/tool/index.mjs";var u="__SANITY_PACKAGE_URL__:dist/util/a.js"',
      join(root, 'dist/_chunks/chunk.js'),
      root,
    )
    expect(code).toBe(
      'import "../node_modules/tool/index.mjs";var u=new URL("../util/a.js",import.meta.url).href',
    )
  })
})

describe('CommonJS namespaces', () => {
  test('lists the exports Node detects, including re-exports', async () => {
    await write('node_modules/reexported/index.js', 'exports.inner = 1')
    await write(
      'node_modules/dep/index.js',
      "exports.a = 1; exports.default = 2; module.exports.b = 3; __exportStar(require('reexported'), exports)",
    )
    expect(await commonJsExports(join(root, 'node_modules/dep/index.js'))).toEqual([
      'a',
      'b',
      'inner',
    ])
  })

  test('wraps CommonJS with named exports and the exports object as default', () => {
    const wrapper = commonJsWrapper('/dep.js', ['of', 'not-an-identifier'])
    expect(wrapper).toContain('const m = require("/dep.js");')
    expect(wrapper).toContain('export default m;')
    expect(wrapper).toContain('export {e1 as "not-an-identifier"};')
  })
})

describe('bundlePackage', () => {
  beforeEach(async () => {
    await write('package.json', {name: 'fixture', type: 'module'})
    await write('dist/package.json', {type: 'module'})
    await write(
      'dist/entry.js',
      `import {join} from 'node:path'
import {esm} from 'esm-dep'
import {umd} from 'umd-dep'
import {tool} from 'tool'
import lazy from 'lazy-dep'
export {helper} from './util/helper.js'
export async function run() {
  const {of, asset} = await import('cjs-dep')
  return {
    asset: asset(),
    esm,
    lazy: lazy(),
    of: of(1),
    task: join(import.meta.dirname, 'task.worker.js'),
    tool,
    umd,
    worker: new URL('worker.js', import.meta.url).href,
  }
}
`,
    )
    await write('dist/util/helper.js', "export const helper = 'helper'")
    await write('dist/worker.js', "export const worker = 'worker'")
    await write('dist/task.worker.js', "export const task = 'task'")
    await write('dist/node_modules/esm-dep/package.json', {main: 'index.js', type: 'module'})
    await write('dist/node_modules/esm-dep/index.js', "export const esm = 'esm'")
    await write('dist/node_modules/esm-dep/index.d.ts', 'export declare const esm: string')
    await write('dist/node_modules/cjs-dep/package.json', {main: 'index.js'})
    await write(
      'dist/node_modules/cjs-dep/index.js',
      "const {readFileSync} = require('node:fs'); exports.of = (x) => [x]; exports.asset = () => readFileSync(__dirname + '/asset.txt', 'utf8')",
    )
    await write('dist/node_modules/cjs-dep/asset.txt', 'asset')
    await write('dist/node_modules/umd-dep/package.json', {main: 'umd.js', module: 'esm.js'})
    await write(
      'dist/node_modules/umd-dep/umd.js',
      "(function (f) { if (typeof define === 'function' && define.amd) define(['require', './impl'], f); else f(require) })(function (r) { module.exports = r('./impl') })",
    )
    await write('dist/node_modules/umd-dep/esm.js', "export const umd = 'umd'")
    await write('dist/node_modules/lazy-dep/package.json', {main: 'index.js'})
    await write(
      'dist/node_modules/lazy-dep/index.js',
      "const load = (path) => require(path); module.exports = () => load('./lazy.cjs')",
    )
    await write('dist/node_modules/lazy-dep/lazy.cjs', "module.exports = 'lazy'")
    await write('dist/node_modules/tool/package.json', {main: 'index.mjs'})
    await write(
      'dist/node_modules/tool/index.mjs',
      "import {helper} from '../../util/helper.js'; export const tool = `tool:${helper}`",
    )
  })

  test('bundles dependencies while files loaded by path keep working', async () => {
    const result = await bundlePackage(root, {
      entries: ['dist/entry.js'],
      external: [],
      preserve: ['dist/node_modules/tool'],
    })

    expect(result.entries).toEqual(
      expect.arrayContaining([
        'dist/entry.js',
        'dist/task.worker.js',
        'dist/util/helper.js',
        'dist/worker.js',
      ]),
    )
    expect(result.dynamic).toEqual(['dist/node_modules/lazy-dep (./lazy.cjs from index.js)'])
    // Bundled sources are gone; declarations, assets and preserved packages stay.
    expect(existsSync(join(root, 'dist/node_modules/esm-dep/index.js'))).toBe(false)
    expect(existsSync(join(root, 'dist/node_modules/esm-dep/index.d.ts'))).toBe(true)
    expect(existsSync(join(root, 'dist/node_modules/cjs-dep/asset.txt'))).toBe(true)
    expect(existsSync(join(root, 'dist/node_modules/lazy-dep/lazy.cjs'))).toBe(true)
    expect(await readFile(join(root, 'dist/node_modules/tool/index.mjs'), 'utf8')).toContain(
      '../../util/helper.js',
    )

    const {run} = (await doImport(pathToFileURL(join(root, 'dist/entry.js')).href)) as {
      run: () => Promise<Record<string, unknown>>
    }
    expect(await run()).toEqual({
      asset: 'asset',
      esm: 'esm',
      lazy: 'lazy',
      of: [1],
      task: join(root, 'dist/task.worker.js'),
      tool: 'tool:helper',
      umd: 'umd',
      worker: pathToFileURL(join(root, 'dist/worker.js')).href,
    })
  })

  test('keeps manifests read at runtime and marks CommonJS entry packages as modules', async () => {
    await write('dist/node_modules/plugin/package.json', {main: 'lib/index.js', name: 'plugin'})
    await write(
      'dist/node_modules/plugin/lib/index.js',
      "exports.version = require('node:fs').readFileSync(__dirname + '/../package.json', 'utf8')",
    )
    const result = await bundlePackage(root, {
      entries: ['dist/entry.js', 'dist/node_modules/plugin/lib/index.js'],
      external: [],
      preserve: ['dist/node_modules/tool'],
    })
    expect(result.manifestReaders).toContain('dist/node_modules/plugin')
    const manifest = JSON.parse(
      await readFile(join(root, 'dist/node_modules/plugin/package.json'), 'utf8'),
    )
    expect(manifest.type).toBe('module')
    const plugin = (await doImport(
      pathToFileURL(join(root, 'dist/node_modules/plugin/lib/index.js')).href,
    )) as {default: {version: string}}
    expect(JSON.parse(plugin.default.version).name).toBe('plugin')
  })

  test('leaves external and missing optional modules to runtime resolution', async () => {
    await write(
      'dist/optional.js',
      "export async function load() { try { return await import('missing-optional') } catch { return 'missing' } }",
    )
    const result = await bundlePackage(root, {
      entries: ['dist/entry.js', 'dist/optional.js'],
      external: ['esm-dep'],
      preserve: ['dist/node_modules/tool'],
    })
    expect(result.unresolved).toEqual(['missing-optional (from dist/optional.js)'])
    expect(await readFile(join(root, 'dist/entry.js'), 'utf8')).toContain('"esm-dep"')
  })

  test('rejects missing entries', async () => {
    await expect(
      bundlePackage(root, {entries: ['dist/missing.js'], external: [], preserve: []}),
    ).rejects.toThrow('Missing bundle entry dist/missing.js')
  })
})
