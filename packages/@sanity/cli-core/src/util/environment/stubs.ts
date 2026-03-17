import {JSDOM} from 'jsdom'

const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body></body>
</html>`

interface AbortSignalLike {
  aborted: boolean
  addEventListener(type: 'abort', listener: () => void, options?: {once?: boolean}): void
  removeEventListener(type: 'abort', listener: () => void): void
}

type EventListenerOptionsWithSignal = AddEventListenerOptions & {signal?: unknown}

function isAbortSignalLike(value: unknown): value is AbortSignalLike {
  return (
    !!value &&
    typeof value === 'object' &&
    'aborted' in value &&
    typeof (value as AbortSignalLike).aborted === 'boolean' &&
    'addEventListener' in value &&
    typeof (value as AbortSignalLike).addEventListener === 'function' &&
    'removeEventListener' in value &&
    typeof (value as AbortSignalLike).removeEventListener === 'function'
  )
}

/**
 * Make JSDOM's `addEventListener({signal})` accept native Node.js AbortSignals.
 *
 * JSDOM validates `signal` using its own realm's `AbortSignal` constructor, which rejects
 * Node's native signal. Instead of replacing the global Abort APIs, intercept those calls
 * and emulate the abortable-listener behavior for cross-realm signals.
 */
function patchEventTargetSignalSupport(dom: JSDOM): void {
  const eventTarget = dom.window.EventTarget
  const addEventListener = eventTarget.prototype.addEventListener

  eventTarget.prototype.addEventListener = function addEventListenerPatched(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ) {
    if (typeof options === 'boolean' || !options?.signal) {
      return addEventListener.call(this, type, listener, options)
    }

    const rawSignal = (options as EventListenerOptionsWithSignal).signal
    const isJSDOMSignal = rawSignal instanceof (dom.window.AbortSignal as typeof AbortSignal)
    if (!rawSignal || isJSDOMSignal || !isAbortSignalLike(rawSignal)) {
      return addEventListener.call(this, type, listener, options)
    }

    const signal: AbortSignalLike = rawSignal
    if (signal.aborted) {
      return
    }

    const {signal: _signal, ...optionsWithoutSignal} = options as EventListenerOptionsWithSignal
    addEventListener.call(this, type, listener, optionsWithoutSignal)

    const removeOnAbort = () => {
      this.removeEventListener(type, listener, options)
      signal.removeEventListener('abort', removeOnAbort)
    }

    signal.addEventListener('abort', removeOnAbort, {once: true})
  }
}

/**
 * Creates a JSDOM instance and applies polyfills for missing browser globals.
 */
function createBrowserDom(): JSDOM {
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: 'http://localhost:3333/',
  })

  patchEventTargetSignalSupport(dom)

  // Special handling of certain globals
  if (typeof dom.window.document.execCommand !== 'function') {
    // Crashes ace editor without this :/
    dom.window.document.execCommand = function execCommand(
      // Provide the right arity for the function, even if unused
      _commandName: string,
      _showDefaultUI: boolean,
      _valueArgument: unknown,
    ) {
      // Return false to indicate "unsupported"
      return false
    }
  }

  if (dom.window.requestIdleCallback === undefined) {
    dom.window.requestIdleCallback = (cb: IdleRequestCallback) => setTimeout(cb, 10)
  }

  if (dom.window.cancelIdleCallback === undefined) {
    dom.window.cancelIdleCallback = (id: number) => clearTimeout(id)
  }

  if (dom.window.ResizeObserver === undefined) {
    dom.window.ResizeObserver = class ResizeObserver {
      // eslint-disable-next-line @typescript-eslint/no-useless-constructor
      constructor(_callback: unknown) {}
      disconnect() {}
      observe(_target: unknown, _options: unknown) {}
      unobserve(_target: unknown) {}
    }
  }

  if (dom.window.IntersectionObserver === undefined) {
    dom.window.IntersectionObserver = class IntersectionObserver {
      options: {root?: unknown; rootMargin?: string; threshold?: number}
      constructor(
        _callback: unknown,
        options?: {root?: unknown; rootMargin?: string; threshold?: number},
      ) {
        this.options = options || {}
      }
      get root() {
        return this.options.root || null
      }
      get rootMargin() {
        return this.options.rootMargin || ''
      }
      get thresholds() {
        return Array.isArray(this.options.threshold)
          ? this.options.threshold
          : [this.options.threshold || 0]
      }

      disconnect() {}
      observe(_el: unknown) {}
      takeRecords() {
        return []
      }
      unobserve(_el: unknown) {}
    }
  }

  if (dom.window.matchMedia === undefined) {
    dom.window.matchMedia = (_qs: unknown) =>
      ({
        matches: false,
        media: '',
        onchange: null,
      }) as MediaQueryList
  }

  return dom
}

/**
 * Collects all browser globals from the JSDOM window that should be injected
 * into the Node.js global scope to emulate a browser environment.
 *
 * This dynamically iterates over all own properties of the JSDOM window,
 * skipping internal JSDOM properties (prefixed with `_`) and properties that
 * already exist in Node.js globals to avoid conflicts.
 *
 * This approach ensures that any new properties added by JSDOM upgrades are
 * automatically included, preventing "missing global" bugs (e.g. `Element`,
 * `HTMLElement`, `SVGElement` needed by libraries like styled-components).
 */
function collectBrowserStubs(): Record<string, unknown> {
  const dom = createBrowserDom()
  const stubs: Record<string, unknown> = Object.create(null)
  const nodeGlobals = new Set(Object.getOwnPropertyNames(globalThis))

  for (const key of Object.getOwnPropertyNames(dom.window)) {
    // Skip internal JSDOM properties
    if (key.startsWith('_')) continue

    // Skip numeric indices (e.g. '0' for window[0])
    if (/^\d+$/.test(key)) continue

    // Skip properties that Node.js already provides to avoid conflicts
    if (nodeGlobals.has(key)) continue

    stubs[key] = (dom.window as Record<string, unknown>)[key]
  }

  return stubs
}

let browserStubs: Record<string, unknown> | undefined

export function getBrowserStubs(): Record<string, unknown> {
  if (!browserStubs) {
    browserStubs = collectBrowserStubs()
  }
  return browserStubs
}
