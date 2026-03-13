import {CSS_COLORS} from '../colors.js'
import {humanize} from '../humanize.js'
import {type DebugEnv, type DebugFunction, type Formatter} from '../types.js'

/**
 * Minimal Storage interface for localStorage access.
 * Avoids pulling in the full DOM lib for this single file.
 */
interface WebStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

// eslint-disable-next-line no-var -- must be `var` for global augmentation
declare var localStorage: WebStorage | undefined

/**
 * Detect whether colors should be used for debug output.
 *
 * Returns true unconditionally - all baseline 2024 browsers support
 * `%c` CSS directives in the console.
 */
function useColors(): boolean {
  return true
}

/**
 * Safely access localStorage, returning undefined if it throws
 * (e.g. Safari private browsing, sandboxed iframes).
 */
function getStorage(): WebStorage | undefined {
  try {
    return localStorage
  } catch {
    return undefined
  }
}

/**
 * Persist enabled namespaces to localStorage.
 * If namespaces is undefined, removes the key.
 */
function save(namespaces: string | undefined): void {
  try {
    if (namespaces) {
      getStorage()?.setItem('debug', namespaces)
    } else {
      getStorage()?.removeItem('debug')
    }
  } catch {
    // Swallow storage errors (private browsing, quota exceeded, etc.)
  }
}

/**
 * Load persisted namespace string.
 *
 * Checks localStorage keys `debug` and `DEBUG` (fallback).
 * Falls back to `process.env.DEBUG` for Electron/hybrid environments.
 */
function load(): string | undefined {
  try {
    const val = getStorage()?.getItem('debug') || getStorage()?.getItem('DEBUG')
    if (val) return val
  } catch {
    // Swallow storage errors
  }

  if (typeof process !== 'undefined' && process.env?.DEBUG) {
    return process.env.DEBUG
  }

  return undefined
}

/**
 * Format debug arguments with CSS color directives (with colors)
 * or plain text prefixes (without colors).
 *
 * With colors: uses `%c` CSS directives for namespace color + time delta.
 * Without colors: plain text with namespace + time delta.
 */
function formatArgs(this: DebugFunction, args: unknown[]): void {
  args[0] =
    (this.useColors ? '%c' : '') +
    this.namespace +
    (this.useColors ? ' %c' : ' ') +
    args[0] +
    (this.useColors ? '%c ' : ' ') +
    '+' +
    humanize(this.diff)

  if (!this.useColors) return

  const c = `color: ${this.color}`
  args.splice(1, 0, c, 'color: inherit')

  // Find the position of the last %c directive in the format string
  // so we can insert the corresponding CSS argument at the right index
  let index = 0
  let lastC = 0
  ;(args[0] as string).replaceAll(/%[a-zA-Z%]/g, (match) => {
    if (match === '%%') return match
    index++
    if (match === '%c') {
      lastC = index
    }
    return match
  })

  args.splice(lastC, 0, c)
}

/**
 * Write formatted output to the console.
 * Uses `console.debug` with `console.log` as fallback.
 */
const log: (...args: unknown[]) => void =
  typeof console === 'undefined' ? () => {} : console.debug || console.log || (() => {})

const formattersMap: Record<string, Formatter> = {
  /**
   * JSON formatter (%j).
   * Handles circular references gracefully.
   */
  j(_v: unknown): string {
    try {
      return JSON.stringify(_v)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return `[UnexpectedJSONParseError]: ${message}`
    }
  },
}

export const browserEnv: DebugEnv = {
  colors: () => CSS_COLORS,
  formatArgs,
  formatters: formattersMap,
  load,
  log: log.bind(console),
  save,
  useColors,
}
