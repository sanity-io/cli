import {type InspectOptions} from 'node:util'

/**
 * A debug function created by `createDebug()`.
 * Call it to log debug output when the namespace is enabled.
 *
 * @public
 */
export interface DebugFunction {
  (...args: unknown[]): void
  /** The assigned color for this namespace (ANSI code or CSS hex) */
  color: number | string
  /** Milliseconds since last call to this instance */
  diff: number
  /** Whether this instance is enabled. Getter checks global state; setter overrides. */
  enabled: boolean
  /** Create a child debug instance with extended namespace */
  extend: (namespace: string, delimiter?: string) => DebugFunction
  /** The namespace this instance was created with */
  namespace: string
  /** Whether colors are enabled for this instance */
  useColors: boolean

  /** Timestamp of current call */
  curr?: number
  /** Node.js inspect options (per-instance copy) */
  inspectOpts?: InspectOptions & Record<string, unknown>
  /** Override output function for this instance */
  log?: (...args: unknown[]) => void
  /** Timestamp of previous call */
  prev?: number
}

/**
 * Formatter function for printf-style %X placeholders.
 * `this` is bound to the debug instance being called.
 *
 * @public
 */
export type Formatter = (this: DebugFunction, value: unknown) => string

/**
 * Structured debug entry for file/socket output.
 *
 * @internal
 */
export interface DebugEntry {
  diff: number
  msg: string
  ns: string
  ts: string
}

/**
 * Environment-specific implementation provided to the factory.
 *
 * @internal
 */
export interface DebugEnv {
  /** Get the color palette (lazy, so Node can check terminal depth) */
  colors: () => ReadonlyArray<number | string>
  /** Add colors/prefixes to args array. `this` is the debug instance. */
  formatArgs: (this: DebugFunction, args: unknown[]) => void
  /** Environment-specific printf formatters (%o, %O, %j) */
  formatters: Record<string, Formatter>
  /** Load persisted namespace string */
  load: () => string | undefined
  /** Write formatted output (stderr in Node, console in browser) */
  log: (...args: unknown[]) => void
  /** Persist enabled namespaces (process.env or localStorage) */
  save: (namespaces: string | undefined) => void
  /** Detect whether colors should be used */
  useColors: () => boolean

  /** Per-instance initialization (e.g. inspectOpts in Node) */
  init?: (instance: DebugFunction) => void
  /** Structured output callback (e.g. JSONL file writer) */
  onDebug?: (entry: DebugEntry) => void
}
