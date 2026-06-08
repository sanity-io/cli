import {createRequire} from 'node:module'
import {dirname} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import vm from 'node:vm'

import {
  ESModulesEvaluator,
  type EvaluatedModuleNode,
  type ModuleEvaluator,
  type ModuleRunnerContext,
  ssrDynamicImportKey,
  ssrExportAllKey,
  ssrExportNameKey,
  ssrImportKey,
  ssrImportMetaKey,
  ssrModuleExportsKey,
} from 'vite/module-runner'

function isCommonJsCode(code: string): boolean {
  return (
    /\bmodule\.exports\b/.test(code) ||
    /\bexports\.[a-zA-Z_$]/.test(code) ||
    /(?:^|[;\n])\s*exports\s=/.test(code) ||
    /(?:^|\n|\s)require\s*\(/.test(code)
  )
}

function isPrimitive(value: unknown): boolean {
  return !value || (typeof value !== 'object' && typeof value !== 'function')
}

function defineExport(exports: Record<string, unknown>, key: string, getter: () => unknown) {
  Object.defineProperty(exports, key, {
    configurable: true,
    enumerable: true,
    get: getter,
  })
}

function exportAll(exports: Record<string, unknown>, sourceModule: unknown) {
  if (exports === sourceModule) return
  if (isPrimitive(sourceModule) || Array.isArray(sourceModule) || sourceModule instanceof Promise) {
    return
  }

  for (const key in sourceModule as Record<string, unknown>) {
    if (key !== 'default' && !(key in exports)) {
      try {
        defineExport(exports, key, () => (sourceModule as Record<string, unknown>)[key])
      } catch {
        // ignore non-configurable exports
      }
    }
  }
}

/**
 * Module evaluator that can execute raw CommonJS modules in addition to
 * Vite's SSR-transformed ESM. Matches vite-node's CJS execution behavior,
 * which ModuleRunner's default ESModulesEvaluator does not support.
 */
export class StudioModuleEvaluator implements ModuleEvaluator {
  readonly startOffset = new ESModulesEvaluator().startOffset
  private readonly esmEvaluator = new ESModulesEvaluator()

  runExternalModule(filepath: string): Promise<unknown> {
    return this.esmEvaluator.runExternalModule(filepath)
  }

  runInlinedModule(
    context: ModuleRunnerContext,
    code: string,
    module: Readonly<EvaluatedModuleNode>,
  ): Promise<void> {
    if (!isCommonJsCode(code)) {
      return (this.esmEvaluator as ModuleEvaluator).runInlinedModule(context, code, module)
    }

    return this.runCommonJsModule(context, code, module)
  }

  private async runCommonJsModule(
    context: ModuleRunnerContext,
    code: string,
    module: Readonly<EvaluatedModuleNode>,
  ): Promise<void> {
    const modulePath = module.file || module.id
    const href = pathToFileURL(modulePath).href
    const __filename = fileURLToPath(href)
    const __dirname = dirname(__filename)

    const exports = context[ssrModuleExportsKey]
    const moduleNotDefined = Symbol('not defined')
    let moduleExports: unknown = moduleNotDefined

    const cjsExports = new Proxy(exports, {
      get: (target, property, receiver) => {
        if (Reflect.has(target, property)) return Reflect.get(target, property, receiver)
        return Reflect.get(Object.prototype, property, receiver)
      },
      getPrototypeOf: () => Object.prototype,
      set: (_, property, value) => {
        if (property === 'default') {
          exportAll(exports, {default: value})
          exports.default = value
          return true
        }
        if (!Reflect.has(exports, 'default')) {
          exports.default = {}
        }
        if (moduleExports !== moduleNotDefined && isPrimitive(moduleExports)) {
          defineExport(exports, String(property), () => {})
          return true
        }
        if (!isPrimitive(exports.default) && typeof exports.default === 'object') {
          ;(exports.default as Record<string, unknown>)[String(property)] = value
        }
        if (property !== 'default') {
          defineExport(exports, String(property), () => value)
        }
        return true
      },
    })

    const moduleProxy = {
      get exports() {
        return cjsExports
      },
      set exports(value: unknown) {
        exportAll(exports, value)
        exports.default = value
        moduleExports = value
      },
    }

    const cjsContext: Record<string, unknown> = {
      __dirname,
      __filename,
      exports: cjsExports,
      module: moduleProxy,
      require: createRequire(href),
      [ssrDynamicImportKey]: context[ssrDynamicImportKey],
      [ssrExportAllKey]: context[ssrExportAllKey],
      [ssrExportNameKey]: context[ssrExportNameKey],
      [ssrImportKey]: context[ssrImportKey],
      [ssrImportMetaKey]: context[ssrImportMetaKey],
      [ssrModuleExportsKey]: exports,
    }

    let normalizedCode = code
    if (normalizedCode[0] === '#') {
      normalizedCode = normalizedCode.replace(/^#!.*/, (line) => ' '.repeat(line.length))
    }

    const parameterNames = Object.keys(cjsContext)
    const wrappedCode = `'use strict';async (${parameterNames.join(',')})=>{${normalizedCode}\n}`
    const script = new vm.Script(wrappedCode, {filename: __filename})

    const runner = script.runInThisContext()
    await runner(...parameterNames.map((name) => cjsContext[name]))
  }
}
