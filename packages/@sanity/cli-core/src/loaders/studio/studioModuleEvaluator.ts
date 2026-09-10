import {createRequire} from 'node:module'
import {dirname} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {
  ESModulesEvaluator,
  type EvaluatedModuleNode,
  type ModuleEvaluator,
  type ModuleRunnerContext,
  ssrModuleExportsKey,
} from 'vite/module-runner'

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
  private readonly esmEvaluator = new ESModulesEvaluator()
  readonly startOffset = this.esmEvaluator.startOffset

  runExternalModule(filepath: string): Promise<unknown> {
    return this.esmEvaluator.runExternalModule(filepath)
  }

  runInlinedModule(
    context: ModuleRunnerContext,
    code: string,
    module: Readonly<EvaluatedModuleNode>,
  ): Promise<void> {
    // Every inlined module gets the CommonJS bindings, like vite-node did. Detecting
    // CommonJS from the source text is not reliable (minified UMD wrappers, bracket
    // notation and `Object.defineProperty(exports, …)` all evade it), and the extra
    // bindings are inert in SSR-transformed ESM, which only ever references
    // `__vite_ssr_*` names.
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
        // The `cjsExports !== value` check has to gate the whole branch: the CommonJS
        // interop footer `module.exports.__esModule = true; module.exports.default =
        // module.exports` points `default` at the exports object itself, and assigning
        // that would replace a real function default with the exports proxy. Falling
        // through to the generic path leaves the existing `default` untouched.
        if (property === 'default' && cjsExports !== value) {
          // Modules that assign an object to `default` (`exports.default = api`) should
          // keep their named exports; `exportAll` forwards them onto the namespace.
          exportAll(exports, value)
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
        if (!isPrimitive(exports.default)) {
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
      ...context,
      __dirname,
      __filename,
      exports: cjsExports,
      module: moduleProxy,
      require: createRequire(href),
    }

    let normalizedCode = code
    if (normalizedCode[0] === '#') {
      normalizedCode = normalizedCode.replace(/^#!.*/, (line) => ' '.repeat(line.length))
    }

    // Use AsyncFunction (same as ESModulesEvaluator) so the shared `startOffset`
    // ModuleRunner applies to inlined sourcemaps matches this wrapper's padding.
    const AsyncFunction = async function () {}.constructor as new (
      ...args: string[]
    ) => (...args: unknown[]) => Promise<unknown>
    const parameterNames = Object.keys(cjsContext)
    const runner = new AsyncFunction(...parameterNames, `"use strict";\n${normalizedCode}`)
    await runner(...parameterNames.map((name) => cjsContext[name]))
  }
}
