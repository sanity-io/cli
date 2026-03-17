import {JSDOM} from 'jsdom'

const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body></body>
</html>`

/**
 * Globals that MUST use JSDOM's version even though Node.js also provides them.
 *
 * JSDOM's DOM implementations (e.g. `addEventListener`) perform `instanceof` checks
 * against its own classes. When user code creates an `AbortController` from Node's
 * global, the resulting signal fails JSDOM's `instanceof AbortSignal` check:
 *
 *   "Failed to execute 'addEventListener' on 'EventTarget': parameter 3 dictionary
 *    has member 'signal' that is not of type 'AbortSignal'."
 *
 * By forcing these globals to come from JSDOM, all code in the worker thread uses the
 * same realm's classes, and the instanceof checks pass.
 */
export const FORCE_JSDOM_GLOBALS = new Set(['AbortController', 'AbortSignal'])

/**
 * Creates a JSDOM instance and applies polyfills for missing browser globals.
 */
function createBrowserDom(): JSDOM {
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: 'http://localhost:3333/',
  })

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

    // Skip properties that Node.js already provides to avoid conflicts,
    // unless they must come from JSDOM to avoid cross-realm instanceof failures
    if (nodeGlobals.has(key) && !FORCE_JSDOM_GLOBALS.has(key)) continue

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
