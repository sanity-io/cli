import {dirname} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {
  type EvaluatedModuleNode,
  type ModuleRunnerContext,
  ssrDynamicImportKey,
  ssrExportAllKey,
  ssrExportNameKey,
  ssrImportKey,
  ssrImportMetaKey,
  ssrModuleExportsKey,
} from 'vite/module-runner'
import {describe, expect, test} from 'vitest'

import {StudioModuleEvaluator} from '../studioModuleEvaluator.js'

const MODULE_PATH = fileURLToPath(import.meta.url)

async function evaluate(code: string): Promise<Record<string, any>> {
  const exports: Record<string, any> = Object.create(null)
  const context = {
    [ssrDynamicImportKey]: () => Promise.reject(new Error('Unexpected dynamic import')),
    [ssrExportAllKey]: () => {
      throw new Error('Unexpected `export *`')
    },
    [ssrExportNameKey]: (name: string, getter: () => unknown) =>
      Object.defineProperty(exports, name, {configurable: true, enumerable: true, get: getter}),
    [ssrImportKey]: () => Promise.reject(new Error('Unexpected import')),
    [ssrImportMetaKey]: {
      dirname: dirname(MODULE_PATH),
      filename: MODULE_PATH,
      url: pathToFileURL(MODULE_PATH).href,
    },
    [ssrModuleExportsKey]: exports,
  } as unknown as ModuleRunnerContext

  await new StudioModuleEvaluator().runInlinedModule(context, code, {
    file: MODULE_PATH,
    id: MODULE_PATH,
  } as EvaluatedModuleNode)

  return exports
}

describe('StudioModuleEvaluator', () => {
  test.each(['const', 'let', 'var'])(
    'allows %s declarations to shadow CommonJS bindings',
    async (declaration) => {
      const namespace = await evaluate(
        `${declaration} exports = 'local exports';\n` +
          `${declaration} module = 'local module';\n` +
          `${declaration} require = 'local require';\n` +
          `${declaration} __filename = 'local filename';\n` +
          `${declaration} __dirname = 'local dirname';\n` +
          `__vite_ssr_exportName__('bindings', () => [exports, module, require, __filename, __dirname]);\n`,
      )

      expect(namespace.bindings).toEqual([
        'local exports',
        'local module',
        'local require',
        'local filename',
        'local dirname',
      ])
      expect(namespace.default).toBeUndefined()
    },
  )

  test('preserves strict mode and waits for top-level await', async () => {
    const namespace = await evaluate(
      `const value = await Promise.resolve('awaited');\n` +
        `__vite_ssr_exportName__('value', () => value);\n` +
        `__vite_ssr_exportName__('topLevelThis', () => this);\n` +
        `__vite_ssr_exportName__('functionThis', () => (function () { return this })());\n`,
    )

    expect(namespace.value).toBe('awaited')
    expect(namespace.topLevelThis).toBeUndefined()
    expect(namespace.functionThis).toBeUndefined()
  })

  test('provides CommonJS bindings from the enclosing scope', async () => {
    const namespace = await evaluate(
      `const path = require('node:path');\n` +
        `module.exports = {filename: __filename, dirname: __dirname, basename: path.basename(__filename)};\n`,
    )

    expect(namespace.default).toEqual({
      basename: 'studioModuleEvaluator.test.ts',
      dirname: dirname(MODULE_PATH),
      filename: MODULE_PATH,
    })
  })

  test('preserves CommonJS bindings when var declarations redeclare them', async () => {
    const namespace = await evaluate(
      `var exports, module, require, __filename, __dirname;\n` +
        `exports.filename = __filename;\n` +
        `exports.dirname = __dirname;\n` +
        `module.exports.basename = require('node:path').basename(__filename);\n`,
    )

    expect(namespace.default).toEqual({
      basename: 'studioModuleEvaluator.test.ts',
      dirname: dirname(MODULE_PATH),
      filename: MODULE_PATH,
    })
  })

  test('gives minified UMD modules a callable default export', async () => {
    const namespace = await evaluate(
      `!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):` +
        `"function"==typeof define&&define.amd?define(["exports"],t):` +
        `t((e="undefined"!=typeof globalThis?globalThis:e||self).myLib={})}` +
        `(this,function(e){"use strict";function n(x){return"UMD:"+x}e.default=n,e.__esModule=!0});`,
    )

    expect(namespace.default).toBeTypeOf('function')
    expect(namespace.default('value')).toBe('UMD:value')
  })

  test('keeps the named exports of modules that assign an object to `default`', async () => {
    const namespace = await evaluate(
      `"use strict";\n` +
        `var api = {helper: function () {return "helped"}};\n` +
        `exports.default = api;\n`,
    )

    expect(namespace.default.helper()).toBe('helped')
    expect(namespace.helper()).toBe('helped')
  })

  test('hoists CommonJS exports onto a function `default`', async () => {
    const namespace = await evaluate(
      `"use strict";\n` +
        `exports.default = function impl(x) {return "impl:" + x};\n` +
        `exports.helper = function () {return "helped"};\n`,
    )

    expect(namespace.default('value')).toBe('impl:value')
    expect(namespace.default.helper()).toBe('helped')
    expect(namespace.helper()).toBe('helped')
  })

  test('supports CommonJS modules that never write to `exports.<name>`', async () => {
    const withDefineProperty = await evaluate(
      `"use strict";\n` +
        `Object.defineProperty(exports, "__esModule", {value: true});\n` +
        `Object.defineProperty(exports, "default", {enumerable: true, get: function () {return impl}});\n` +
        `function impl(x) {return "defineProperty:" + x}\n`,
    )
    const withObjectAssign = await evaluate(
      `"use strict";\n` +
        `Object.assign(exports, {__esModule: true, default: function (x) {return "assign:" + x}});\n`,
    )
    const withBracketAccess = await evaluate(
      `"use strict";\n` +
        `exports["__esModule"] = true;\n` +
        `exports["default"] = function (x) {return "bracket:" + x};\n`,
    )

    expect(withDefineProperty.default('value')).toBe('defineProperty:value')
    expect(withObjectAssign.default('value')).toBe('assign:value')
    expect(withBracketAccess.default('value')).toBe('bracket:value')
  })

  test('assigning `module.exports` replaces the default export', async () => {
    const namespace = await evaluate(
      `"use strict";\n` +
        `function impl(x) {return "impl:" + x}\n` +
        `impl.helper = function () {return "helped"};\n` +
        `module.exports = impl;\n`,
    )

    expect(namespace.default('value')).toBe('impl:value')
    expect(namespace.helper()).toBe('helped')
  })

  test('keeps the function default when a module points `default` back at `module.exports`', async () => {
    const namespace = await evaluate(
      `"use strict";\n` +
        `function impl(x) {return "impl:" + x}\n` +
        `module.exports = impl;\n` +
        `module.exports.__esModule = true;\n` +
        `module.exports["default"] = module.exports;\n`,
    )

    expect(namespace.default).toBeTypeOf('function')
    expect(namespace.default('value')).toBe('impl:value')
    expect(namespace.default.default).not.toBe(namespace.default)
  })

  test('leaves SSR-transformed ESM to the `__vite_ssr_*` bindings', async () => {
    const namespace = await evaluate(
      `const value = "esm";\n` +
        `Object.defineProperty(__vite_ssr_exports__, "value", ` +
        `{enumerable: true, configurable: true, get(){ return value }});\n` +
        `__vite_ssr_exportName__("named", () => value);\n`,
    )

    expect(namespace.value).toBe('esm')
    expect(namespace.named).toBe('esm')
    expect(namespace.default).toBeUndefined()
  })
})
