import ora, {
  type Options,
  type Ora,
  oraPromise,
  type Spinner as OraSpinner,
  type PersistOptions,
  type PromiseOptions,
} from 'ora'

import {getCliExecutionContext} from '../executionContext.js'

/**
 * Uncolored counterparts of the `log-symbols` glyphs a real spinner persists
 * with. Lines forwarded to an execution context are handed to the embedding
 * host verbatim, so they should not carry ANSI codes the host has to strip.
 */
const persistSymbols = {
  error: '✖',
  info: 'ℹ',
  success: '✔',
  warning: '⚠',
}

function resolveAffix(value: Options['prefixText'] | Options['suffixText']): string {
  const resolved = typeof value === 'function' ? value() : value
  return typeof resolved === 'string' ? resolved : ''
}

/**
 * Stand-in for a real spinner, used when a CLI execution context is active.
 *
 * Frame animation and transient text updates have nowhere useful to go, so they
 * are dropped. The lines a spinner *persists* (`succeed`, `fail`, `warn`,
 * `info`, `stopAndPersist`) are the command's actual output rather than
 * progress, so they are forwarded to the context's sink instead of being
 * swallowed. Ora writes to `process.stderr` by default, so the `stderr` sink is
 * preferred, falling back to `stdout`.
 */
function silentSpinner(options?: Options | string): Ora {
  const resolved = typeof options === 'string' ? {text: options} : (options ?? {})
  const context = getCliExecutionContext()
  const emit = resolved.isSilent ? undefined : (context?.stderr ?? context?.stdout)

  const prefixText = resolveAffix(resolved.prefixText)
  const suffixText = resolveAffix(resolved.suffixText)
  const state = {text: resolved.text ?? ''}

  const persist = (symbol: string, text?: string): void => {
    if (!emit) return

    // Mirrors ora's own line layout, minus the trailing whitespace it leaves
    // behind when only one of the symbol and the text is present.
    const body = text ?? state.text
    const line =
      (prefixText ? `${prefixText} ` : '') +
      symbol +
      (symbol && body ? ` ${body}` : body) +
      (suffixText ? ` ${suffixText}` : '')

    if (line.trim() !== '') emit(line)
  }

  const instance = {
    clear: () => instance,
    fail: (text?: string) => {
      persist(persistSymbols.error, text)
      return instance
    },
    frame: () => '',
    info: (text?: string) => {
      persist(persistSymbols.info, text)
      return instance
    },
    isSpinning: false,
    prefixText,
    render: () => instance,
    start: () => instance,
    stop: () => instance,
    stopAndPersist: (persistOptions: PersistOptions = {}) => {
      persist(persistOptions.symbol ?? '', persistOptions.text)
      return instance
    },
    succeed: (text?: string) => {
      persist(persistSymbols.success, text)
      return instance
    },
    suffixText,
    get text(): string {
      return state.text
    },
    set text(value: string) {
      state.text = value
    },
    warn: (text?: string) => {
      persist(persistSymbols.warning, text)
      return instance
    },
  }
  return instance as unknown as Ora
}

// Ora's default `discardStdin: true` puts stdin in raw mode, which stops the
// kernel from turning Ctrl+C into SIGINT (and ora's userland re-signal
// fallback never fires on a non-flowing stdin), hanging the process. Keep it
// off by default; explicit caller options still win.
function normalize<T extends Options>(options?: string | T): T {
  const resolved = typeof options === 'string' ? ({text: options} as T) : (options ?? ({} as T))
  return {discardStdin: false, ...resolved}
}

export function spinner(options?: Options | string): Ora {
  return getCliExecutionContext() ? silentSpinner(options) : ora(normalize(options))
}

export function spinnerPromise<T>(
  action: ((instance: Ora) => PromiseLike<T>) | PromiseLike<T>,
  options?: PromiseOptions<T> | string,
): Promise<T> {
  if (!getCliExecutionContext()) return oraPromise(action, normalize(options))
  return Promise.resolve(typeof action === 'function' ? action(silentSpinner(options)) : action)
}

export type Spinner = OraSpinner
export type SpinnerInstance = Ora
export type SpinnerOptions = Options
export type SpinnerPromiseOptions<T> = PromiseOptions<T>
