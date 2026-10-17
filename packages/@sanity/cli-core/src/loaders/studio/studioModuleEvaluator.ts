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

import {getNodeModuleFormat} from './studioWorkerExternals.js'

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

function isCommonJsUrl(url: string): boolean {
  if (!url.startsWith('file://')) return false
  return getNodeModuleFormat(fileURLToPath(url)) === 'commonjs'
}

/**
 * Node.js only exposes the named exports of a CommonJS module that its static
 * analysis can detect, while bundlers (and modules evaluated by the runner)
 * expose every property of `module.exports`. Fall back to `module.exports` for
 * names that Node.js didn't detect, so that `import {name} from 'cjs-package'`
 * in the studio config behaves the same whether the package is loaded natively
 * or through Vite.
 */
function withCommonJsNamedExports(namespace: unknown): unknown {
  if (isPrimitive(namespace)) return namespace

  const moduleNamespace = namespace as Record<PropertyKey, unknown>
  const moduleExports = moduleNamespace.default
  if (isPrimitive(moduleExports)) return namespace

  const fallback = moduleExports as Record<PropertyKey, unknown>
  const has = (key: PropertyKey) => key in moduleNamespace || (key !== 'then' && key in fallback)
  const get = (key: PropertyKey) => (key in moduleNamespace ? moduleNamespace[key] : fallback[key])

  // The namespace object itself is not extensible, so it can't be the proxy target
  return new Proxy(Object.create(null) as Record<PropertyKey, unknown>, {
    get: (_target, key) => (has(key) ? get(key) : undefined),
    getOwnPropertyDescriptor: (_target, key) =>
      has(key)
        ? {configurable: true, enumerable: true, value: get(key), writable: false}
        : undefined,
    has: (_target, key) => has(key),
    ownKeys: () => [...new Set([...Reflect.ownKeys(moduleNamespace), ...Object.keys(fallback)])],
  })
}

/**
 * Module evaluator that can execute raw CommonJS modules in addition to
 * Vite's SSR-transformed ESM. Matches vite-node's CJS execution behavior,
 * which ModuleRunner's default ESModulesEvaluator does not support.
 */
export class StudioModuleEvaluator implements ModuleEvaluator {
  private readonly esmEvaluator = new ESModulesEvaluator()
  readonly startOffset = this.esmEvaluator.startOffset

  async runExternalModule(filepath: string): Promise<unknown> {
    const namespace = await this.esmEvaluator.runExternalModule(filepath)
    return isCommonJsUrl(filepath) ? withCommonJsNamedExports(namespace) : namespace
  }

  runInlinedModule(
    context: ModuleRunnerContext,
    code: string,
    module: Readonly<EvaluatedModuleNode>,
  ): Promise<void> {
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
        // Keep the module default when CommonJS aliases it back to `module.exports`.
        if (property === 'default' && cjsExports !== value) {
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

    const AsyncFunction = async function () {}.constructor as new (
      ...args: string[]
    ) => (...args: unknown[]) => Promise<unknown>
    const parameterNames = Object.keys(cjsContext)
    const runner = new AsyncFunction(...parameterNames, `"use strict";{\n${normalizedCode}\n}`)
    await runner(...parameterNames.map((name) => cjsContext[name]))
  }
}
