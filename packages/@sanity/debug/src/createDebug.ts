import {selectColor} from './colors.js'
import {type DebugEnv, type DebugFunction, type Formatter} from './types.js'

export interface DebugExports {
  createDebug: (namespace: string) => DebugFunction
  disable: () => string
  enable: (namespaces: string) => void
  enabled: (namespace: string) => boolean
  formatters: Record<string, Formatter>
}

export function createDebugFactory(env: DebugEnv): DebugExports {
  // Shared state
  let names: string[] = []
  let skips: string[] = []
  let currentNamespaces = ''
  const formatters: Record<string, Formatter> = {...env.formatters}

  function enable(namespaces: string): void {
    env.save(namespaces || undefined)
    currentNamespaces = namespaces

    names = []
    skips = []

    const split = (typeof namespaces === 'string' ? namespaces : '')
      .trim()
      .replaceAll(/\s+/g, ',')
      .split(',')
      .filter(Boolean)

    for (const ns of split) {
      if (ns[0] === '-') {
        skips.push(ns.slice(1))
      } else {
        names.push(ns)
      }
    }
  }

  function disable(): string {
    const prev = [...names, ...skips.map((ns) => `-${ns}`)].join(',')
    enable('')
    return prev
  }

  function enabled(name: string): boolean {
    if (name === '') return false

    for (const skip of skips) {
      if (matchesTemplate(name, skip)) return false
    }

    for (const ns of names) {
      if (matchesTemplate(name, ns)) return true
    }

    return false
  }

  function createDebug(namespace: string): DebugFunction {
    let prevTime: number | undefined
    let enableOverride: boolean | null = null
    let namespacesCache: string | undefined
    let enabledCache = false

    function debug(...args: unknown[]): void {
      if (!instance.enabled) return

      const curr = Date.now()
      const ms = curr - (prevTime || curr)
      instance.diff = ms
      instance.prev = prevTime
      instance.curr = curr
      prevTime = curr

      const formatted = [...args]

      if (formatted[0] instanceof Error) {
        formatted[0] = formatted[0].stack || formatted[0].message
      }

      if (typeof formatted[0] !== 'string') {
        formatted.unshift('%O')
      }

      // Apply custom formatters
      let index = 0
      formatted[0] = (formatted[0] as string).replaceAll(
        /%([a-zA-Z%])/g,
        (match, format: string) => {
          if (match === '%%') return '%'
          index++
          const formatter = formatters[format]
          if (typeof formatter === 'function') {
            const val = formatted[index]
            const result = formatter.call(instance, val)
            formatted.splice(index, 1)
            index--
            return result
          }
          return match
        },
      )

      // Apply env-specific formatting (colors, prefixes)
      env.formatArgs.call(instance, formatted)

      // Output
      const logFn = instance.log || env.log
      logFn.apply(instance, formatted)
    }

    // Build the instance by assigning properties to the function.
    // TypeScript cannot track properties added via assignment + Object.defineProperty
    // on functions, so we use a targeted cast. This is unavoidable for the
    // "callable object" pattern (function that is also a property bag).
    const instance = debug as unknown as DebugFunction
    instance.namespace = namespace
    instance.useColors = env.useColors()
    instance.color = selectColor(namespace, env.colors())
    instance.diff = 0
    instance.log = undefined

    instance.extend = (ns: string, delimiter = ':'): DebugFunction => {
      const child = createDebug(`${namespace}${delimiter}${ns}`)
      child.log = instance.log
      return child
    }

    Object.defineProperty(instance, 'enabled', {
      configurable: false,
      enumerable: true,
      get: (): boolean => {
        if (enableOverride !== null) return enableOverride
        if (namespacesCache !== currentNamespaces) {
          namespacesCache = currentNamespaces
          enabledCache = enabled(namespace)
        }
        return enabledCache
      },
      set: (v: boolean) => {
        enableOverride = v
      },
    })

    env.init?.(instance)

    return instance
  }

  // Initialize from persisted state
  enable(env.load() || '')

  return {createDebug, disable, enable, enabled, formatters}
}

/** Wildcard matching - supports * as glob-style wildcard */
function matchesTemplate(search: string, template: string): boolean {
  let searchIndex = 0
  let templateIndex = 0
  let starIndex = -1
  let matchIndex = 0

  while (searchIndex < search.length) {
    if (
      templateIndex < template.length &&
      (template[templateIndex] === search[searchIndex] || template[templateIndex] === '*')
    ) {
      if (template[templateIndex] === '*') {
        starIndex = templateIndex
        matchIndex = searchIndex
        templateIndex++
      } else {
        searchIndex++
        templateIndex++
      }
    } else if (starIndex === -1) {
      return false
    } else {
      templateIndex = starIndex + 1
      matchIndex++
      searchIndex = matchIndex
    }
  }

  while (templateIndex < template.length && template[templateIndex] === '*') {
    templateIndex++
  }

  return templateIndex === template.length
}
