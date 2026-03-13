import tty from 'node:tty'
import {formatWithOptions, inspect, type InspectOptions} from 'node:util'

import {ANSI_COLORS_BASIC, ANSI_COLORS_EXTENDED} from '../colors.js'
import {humanize} from '../humanize.js'
import {type DebugEnv, type DebugFunction, type Formatter} from '../types.js'

/**
 * Parse DEBUG_* environment variables into inspect-compatible options.
 *
 * Converts env var names like `DEBUG_SHOW_HIDDEN` to camelCase properties
 * (`showHidden`) and coerces values to boolean/number/null as appropriate.
 */
function parseInspectOpts(): InspectOptions & Record<string, unknown> {
  const opts: InspectOptions & Record<string, unknown> = {}

  for (const key of Object.keys(process.env)) {
    if (!/^debug_/i.test(key)) continue

    const prop = key
      .slice(6)
      .toLowerCase()
      .replaceAll(/_([a-z])/g, (_, k: string) => k.toUpperCase())

    const raw = process.env[key]
    let val: unknown
    if (/^(yes|on|true|enabled)$/i.test(raw || '')) {
      val = true
    } else if (/^(no|off|false|disabled)$/i.test(raw || '')) {
      val = false
    } else if (raw === 'null') {
      val = null
    } else {
      val = Number(raw)
    }

    opts[prop] = val
  }

  return opts
}

const inspectOpts = parseInspectOpts()

/**
 * Detect whether colors should be used for debug output.
 *
 * Checks `DEBUG_COLORS` env var first (debug-specific override), then
 * delegates to `process.stderr.hasColors()` which handles `FORCE_COLOR`,
 * `NO_COLOR`, `NODE_DISABLE_COLORS`, and TTY detection automatically.
 * Falls back to `tty.isatty(process.stderr.fd)`.
 */
function useColors(): boolean {
  // Debug-specific override takes highest precedence
  if ('colors' in inspectOpts) {
    return Boolean(inspectOpts.colors)
  }

  // Node built-in handles FORCE_COLOR, NO_COLOR, NODE_DISABLE_COLORS, and TTY
  if (typeof process.stderr?.hasColors === 'function') {
    return process.stderr.hasColors()
  }

  // Fallback
  return tty.isatty(process.stderr.fd)
}

/**
 * Get the color palette based on terminal color depth.
 *
 * Uses `process.stderr.getColorDepth()` to pick palette - depth \>= 8
 * (256 colors) uses extended ANSI palette, otherwise basic 6-color palette.
 */
function getColors(): ReadonlyArray<number> {
  const depth =
    typeof process.stderr?.getColorDepth === 'function'
      ? process.stderr.getColorDepth()
      : tty.isatty(process.stderr.fd)
        ? 4
        : 1

  return depth >= 8 ? ANSI_COLORS_EXTENDED : ANSI_COLORS_BASIC
}

/**
 * Format debug arguments with colors/prefixes.
 *
 * With colors: ANSI escape prefix + multiline support + humanized time delta suffix.
 * Without colors: ISO timestamp + namespace prefix.
 */
function formatArgs(this: DebugFunction, args: unknown[]): void {
  const name = this.namespace

  if (this.useColors) {
    const c = this.color as number
    const colorCode = `\u001B[3${c < 8 ? c : `8;5;${c}`}`
    const prefix = `  ${colorCode};1m${name} \u001B[0m`

    args[0] = prefix + String(args[0]).split('\n').join(`\n${prefix}`)
    args.push(`${colorCode}m+${humanize(this.diff)}\u001B[0m`)
  } else {
    const date = inspectOpts.hideDate ? '' : `${new Date().toISOString()} `
    args[0] = `${date}${name} ${args[0]}`
  }
}

/**
 * Write formatted output to stderr.
 */
function log(...args: unknown[]): void {
  process.stderr.write(`${formatWithOptions(inspectOpts, ...args)}\n`)
}

/**
 * Persist enabled namespaces to process.env.DEBUG.
 */
function save(namespaces: string | undefined): void {
  if (namespaces) {
    process.env.DEBUG = namespaces
  } else {
    delete process.env.DEBUG
  }
}

/**
 * Load persisted namespace string from process.env.DEBUG.
 */
function load(): string | undefined {
  return process.env.DEBUG
}

/**
 * Initialize a debug instance with a copy of the parsed inspectOpts.
 */
function init(debug: DebugFunction): void {
  debug.inspectOpts = {...inspectOpts}
}

const formattersMap: Record<string, Formatter> = {
  /**
   * Single-line `inspect` (%o formatter).
   */
  o(this: DebugFunction, v: unknown): string {
    const opts = {...this.inspectOpts, colors: this.useColors}
    return inspect(v, opts)
      .split('\n')
      .map((str) => str.trim())
      .join(' ')
  },

  /**
   * Multi-line `inspect` (%O formatter).
   */
  O(this: DebugFunction, v: unknown): string {
    const opts = {...this.inspectOpts, colors: this.useColors}
    return inspect(v, opts)
  },
}

export const nodeEnv: DebugEnv = {
  colors: getColors,
  formatArgs,
  formatters: formattersMap,
  init,
  load,
  log,
  save,
  useColors,
}
