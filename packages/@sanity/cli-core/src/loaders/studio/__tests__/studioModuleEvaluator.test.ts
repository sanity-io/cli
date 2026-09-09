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

/**
 * Evaluates `code` the way `ModuleRunner` does and returns the resulting module
 * namespace, so the assertions below see exactly what an importing module would.
 */
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
  test('gives minified UMD modules a callable default export', async () => {
    // A minified UMD wrapper mentions `exports` and `module` only through
    // `typeof` checks and single-letter parameters, so it cannot be recognized
    // as CommonJS from its source text. Without the CommonJS bindings it takes
    // its browser-global branch and exports nothing, and the importing module
    // ends up calling `undefined`.
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
