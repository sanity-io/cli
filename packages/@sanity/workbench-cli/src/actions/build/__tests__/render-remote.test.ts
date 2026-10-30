// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

import {
  act,
  type Context,
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
} from 'react'
import {afterAll, beforeAll, beforeEach, describe, expect, test} from 'vitest'

import {renderRemote} from '../render-remote.js'

describe('renderRemote', () => {
  test('exports a render entry that mounts the bound App into the host node', () => {
    const source = renderRemote({
      app: 'view.components["panel"]',
      preamble: 'import view from "./view.js"',
    })
    expect(source).toContain('const App = view.components["panel"]')
    expect(source).toContain('export function render(rootElement, props, renderOptions)')
    expect(source).toContain('React.createElement(App, args.props)')
  })

  // Pin the whole emitted module: fragment checks can't catch a dropped newline
  // gluing two statements onto one line, a reordered body, or an edit to an
  // unasserted line. The output is a code blob, so the snapshot is the contract.
  test('assembles the full render-contract module (app + version + HMR)', () => {
    const source = renderRemote({
      app: 'view.components["panel"]',
      hmr: true,
      preamble: 'import view from "./view.js"',
      version: 'view.version',
    })
    expect(source).toMatchInlineSnapshot(`
      "// This file is auto-generated on 'sanity build' / 'sanity dev'
      // Modifications to this file are automatically discarded
      import * as React from 'react'
      import { createRoot } from 'react-dom/client'
      const StyleSheetManager = undefined
      import view from "./view.js"

      const App = view.components["panel"]

      export const version = view.version

      // The SDK reads this slot via getDashboardRootContext(), so its symbol, key and value are a
      // contract. Keyed by createContext, not the React namespace: Vite dev pre-bundling can give two
      // importers of one React copy different namespaces.
      const rootSlot = (globalThis[Symbol.for('sanity.os.root')] ??= new WeakMap())
      if (!rootSlot.has(React.createContext)) rootSlot.set(React.createContext, React.createContext(undefined))
      const RootContext = rootSlot.get(React.createContext)
      const rootMap = new Map()
      const rootContexts = new Map()
      // A shared default sheet can overwrite another app's global rules; each root needs its own sheet.
      const styleTargets = new Map()
      const stylisPlugins = new Map()
      const renderArgs = new Map()
      // On globalThis: every module embeds its own copy of this harness, and names must be page-unique.
      const stylisPluginCount = Symbol.for('sanity.os.stylisPluginCount')

      // Identical CSS gets an identical class in every sheet, so a later sheet overrides earlier rules.
      // StyleSheetManager hashes stylis plugin names into class names: a uniquely named no-op isolates a root.
      function uniqueStylisPlugin() {
        globalThis[stylisPluginCount] = (globalThis[stylisPluginCount] ?? 0) + 1
        return Object.defineProperty(() => {}, 'name', { value: 'sanity-root-' + globalThis[stylisPluginCount] })
      }

      // The SDK disposes the root's instance, closing its bus connection, when the signal aborts. Next tick:
      // a host disposing a child root from its own cleanup code leaves the child still unmounting.
      function closeRoot(rootElement) {
        const closing = rootContexts.get(rootElement)
        rootContexts.delete(rootElement)
        if (closing) setTimeout(() => closing.controller.abort(), 0)
      }

      function mount(rootElement, args) {
        let root = rootMap.get(rootElement)
        if (!root) {
          root = createRoot(rootElement, args?.renderOptions?.rootOptions)
          rootMap.set(rootElement, root)
          const controller = new AbortController()
          // Read once: the SDK pins the root's bus identity when it first connects.
          const { moduleId, parentKey } = args?.renderOptions ?? {}
          rootContexts.set(rootElement, { controller, value: { signal: controller.signal, moduleId, parentKey } })
          if (StyleSheetManager) {
            const target = rootElement.ownerDocument.createElement('sanity-styles')
            // React can replace the mount node's contents; keep its stylesheet outside that node.
            rootElement.ownerDocument.head.appendChild(target)
            styleTargets.set(rootElement, target)
            stylisPlugins.set(rootElement, [uniqueStylisPlugin()])
          }
        }
        let element = React.createElement(RootContext.Provider, { value: rootContexts.get(rootElement).value }, React.createElement(App, args.props))
        if (StyleSheetManager) element = React.createElement(StyleSheetManager, { target: styleTargets.get(rootElement), stylisPlugins: stylisPlugins.get(rootElement) }, element)
        // The host's React can't pause this root, so the host pauses the app through this Activity.
        // Keep it inside StrictMode: outside, it stops StrictMode double-invoking effects.
        element = React.createElement(React.Activity, { mode: args.lifecycle === 'background' ? 'hidden' : 'visible' }, element)
        if (args?.renderOptions?.reactStrictMode) element = React.createElement(React.StrictMode, null, element)
        root.render(element)
      }

      export function render(rootElement, props, renderOptions) {
        const args = { lifecycle: 'foreground', props, renderOptions }
        renderArgs.set(rootElement, args)
        mount(rootElement, args)
        return {
          dispose() {
            const current = renderArgs.get(rootElement)
            renderArgs.delete(rootElement)
            if (current?.next) return current.next.dispose()
            const root = rootMap.get(rootElement)
            rootMap.delete(rootElement)
            root?.unmount()
            // Unmount first so effect cleanup can still reach this root's stylesheet.
            styleTargets.get(rootElement)?.remove()
            styleTargets.delete(rootElement)
            stylisPlugins.delete(rootElement)
            closeRoot(rootElement)
          },
          setLifecycle(state) {
            const current = renderArgs.get(rootElement)
            if (!current) return
            if (current.next) return current.next.setLifecycle(state)
            current.lifecycle = state
            mount(rootElement, current)
          },
        }
      }

      if (import.meta.hot) {
        import.meta.hot.accept((next) => {
          if (!next) return
          for (const [rootElement, args] of renderArgs) {
            rootMap.get(rootElement)?.unmount()
            rootMap.delete(rootElement)
            closeRoot(rootElement)
            args.next = next.render(rootElement, args.props, args.renderOptions)
            args.next.setLifecycle(args.lifecycle)
          }
        })
      }
      "
    `)
  })

  // The studio/app entry: the preamble imports `App` directly, so no `App`
  // binding, no `version` export, and no HMR boundary are emitted.
  test('assembles a minimal module — no App binding, version, or HMR', () => {
    const source = renderRemote({preamble: 'import App from "./app.js"'})
    expect(source).toMatchInlineSnapshot(`
      "// This file is auto-generated on 'sanity build' / 'sanity dev'
      // Modifications to this file are automatically discarded
      import * as React from 'react'
      import { createRoot } from 'react-dom/client'
      const StyleSheetManager = undefined
      import App from "./app.js"

      // The SDK reads this slot via getDashboardRootContext(), so its symbol, key and value are a
      // contract. Keyed by createContext, not the React namespace: Vite dev pre-bundling can give two
      // importers of one React copy different namespaces.
      const rootSlot = (globalThis[Symbol.for('sanity.os.root')] ??= new WeakMap())
      if (!rootSlot.has(React.createContext)) rootSlot.set(React.createContext, React.createContext(undefined))
      const RootContext = rootSlot.get(React.createContext)
      const rootMap = new Map()
      const rootContexts = new Map()
      // A shared default sheet can overwrite another app's global rules; each root needs its own sheet.
      const styleTargets = new Map()
      const stylisPlugins = new Map()
      const renderArgs = new Map()
      // On globalThis: every module embeds its own copy of this harness, and names must be page-unique.
      const stylisPluginCount = Symbol.for('sanity.os.stylisPluginCount')

      // Identical CSS gets an identical class in every sheet, so a later sheet overrides earlier rules.
      // StyleSheetManager hashes stylis plugin names into class names: a uniquely named no-op isolates a root.
      function uniqueStylisPlugin() {
        globalThis[stylisPluginCount] = (globalThis[stylisPluginCount] ?? 0) + 1
        return Object.defineProperty(() => {}, 'name', { value: 'sanity-root-' + globalThis[stylisPluginCount] })
      }

      // The SDK disposes the root's instance, closing its bus connection, when the signal aborts. Next tick:
      // a host disposing a child root from its own cleanup code leaves the child still unmounting.
      function closeRoot(rootElement) {
        const closing = rootContexts.get(rootElement)
        rootContexts.delete(rootElement)
        if (closing) setTimeout(() => closing.controller.abort(), 0)
      }

      function mount(rootElement, args) {
        let root = rootMap.get(rootElement)
        if (!root) {
          root = createRoot(rootElement, args?.renderOptions?.rootOptions)
          rootMap.set(rootElement, root)
          const controller = new AbortController()
          // Read once: the SDK pins the root's bus identity when it first connects.
          const { moduleId, parentKey } = args?.renderOptions ?? {}
          rootContexts.set(rootElement, { controller, value: { signal: controller.signal, moduleId, parentKey } })
          if (StyleSheetManager) {
            const target = rootElement.ownerDocument.createElement('sanity-styles')
            // React can replace the mount node's contents; keep its stylesheet outside that node.
            rootElement.ownerDocument.head.appendChild(target)
            styleTargets.set(rootElement, target)
            stylisPlugins.set(rootElement, [uniqueStylisPlugin()])
          }
        }
        let element = React.createElement(RootContext.Provider, { value: rootContexts.get(rootElement).value }, React.createElement(App, args.props))
        if (StyleSheetManager) element = React.createElement(StyleSheetManager, { target: styleTargets.get(rootElement), stylisPlugins: stylisPlugins.get(rootElement) }, element)
        // The host's React can't pause this root, so the host pauses the app through this Activity.
        // Keep it inside StrictMode: outside, it stops StrictMode double-invoking effects.
        element = React.createElement(React.Activity, { mode: args.lifecycle === 'background' ? 'hidden' : 'visible' }, element)
        if (args?.renderOptions?.reactStrictMode) element = React.createElement(React.StrictMode, null, element)
        root.render(element)
      }

      export function render(rootElement, props, renderOptions) {
        const args = { lifecycle: 'foreground', props, renderOptions }
        renderArgs.set(rootElement, args)
        mount(rootElement, args)
        return {
          dispose() {
            const current = renderArgs.get(rootElement)
            renderArgs.delete(rootElement)
            if (current?.next) return current.next.dispose()
            const root = rootMap.get(rootElement)
            rootMap.delete(rootElement)
            root?.unmount()
            // Unmount first so effect cleanup can still reach this root's stylesheet.
            styleTargets.get(rootElement)?.remove()
            styleTargets.delete(rootElement)
            stylisPlugins.delete(rootElement)
            closeRoot(rootElement)
          },
          setLifecycle(state) {
            const current = renderArgs.get(rootElement)
            if (!current) return
            if (current.next) return current.next.setLifecycle(state)
            current.lifecycle = state
            mount(rootElement, current)
          },
        }
      }
      "
    `)
  })
})

/**
 * The render contract is a generated *module*, so the only honest way to test it
 * is to run it: write the generated source out and import it. The temp dir sits
 * inside the package so the module's bare `react` / `react-dom/client` imports
 * resolve the same way they do in a real remote.
 */
const TMP_DIR = path.join(import.meta.dirname, 'tmp')

interface RenderController {
  dispose(): void
  setLifecycle(state: 'background' | 'foreground'): void
}

interface Harness {
  render(
    rootElement: Element,
    props?: unknown,
    renderOptions?: {reactStrictMode?: boolean},
  ): RenderController
}

let moduleCount = 0
const ROOT_PROBE = 'globalThis.__RENDER_REMOTE_ROOT_PROBE__'

async function loadHarness(app = 'globalThis.__RENDER_REMOTE_PROBE__'): Promise<Harness> {
  const source = renderRemote({app, preamble: ''})

  const file = path.join(TMP_DIR, `harness-${moduleCount++}.js`)
  fs.writeFileSync(file, source)
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Harness
}

let effectMounts = 0
let effectCleanups = 0
let setCount: (count: number) => void
let rootSignal: AbortSignal | undefined

function Probe() {
  const [count, setCountState] = useState(0)
  setCount = setCountState
  useEffect(() => {
    effectMounts++
    return () => {
      effectCleanups++
    }
  }, [])
  return createElement('span', null, `probe:${count}`)
}

type RootValue = {signal: AbortSignal} | undefined
const NoRoot = createContext<RootValue>(undefined)

// Reads the root context the way the SDK does, from the slot the harness fills when it loads.
function RootProbe() {
  const slot = (globalThis as Record<symbol, WeakMap<object, Context<RootValue>> | undefined>)[
    Symbol.for('sanity.os.root')
  ]
  rootSignal = useContext(slot?.get(createContext) ?? NoRoot)?.signal
  return createElement('span', null, 'root probe')
}

let container: HTMLDivElement

beforeAll(() => {
  ;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as {__RENDER_REMOTE_PROBE__?: unknown}).__RENDER_REMOTE_PROBE__ = Probe
  ;(globalThis as {__RENDER_REMOTE_ROOT_PROBE__?: unknown}).__RENDER_REMOTE_ROOT_PROBE__ = RootProbe
  fs.mkdirSync(TMP_DIR, {recursive: true})
})

afterAll(() => {
  fs.rmSync(TMP_DIR, {force: true, recursive: true})
})

beforeEach(() => {
  effectMounts = 0
  effectCleanups = 0
  rootSignal = undefined
  container = document.createElement('div')
  document.body.append(container)
})

test('backgrounding pauses the user tree; foregrounding resumes it with its state', async () => {
  const {render} = await loadHarness()

  let controller!: RenderController
  act(() => {
    controller = render(container)
  })
  expect(effectMounts).toBe(1)
  expect(container.textContent).toBe('probe:0')

  act(() => setCount(5))
  expect(container.textContent).toBe('probe:5')

  // Hidden: React tears the user tree's effects down, keeping its state.
  act(() => controller.setLifecycle('background'))
  expect(effectCleanups).toBe(1)
  expect(effectMounts).toBe(1)

  act(() => controller.setLifecycle('foreground'))
  expect(effectMounts).toBe(2)
  expect(container.textContent).toBe('probe:5')
})

test('disposing unmounts the user tree', async () => {
  const {render} = await loadHarness()

  let controller!: RenderController
  act(() => {
    controller = render(container)
  })
  expect(effectMounts).toBe(1)

  act(() => controller.dispose())
  expect(effectCleanups).toBe(1)
  expect(container.textContent).toBe('')
})

test('disposing detaches `setLifecycle`, so a late call is inert', async () => {
  const {render} = await loadHarness()

  let controller!: RenderController
  act(() => {
    controller = render(container)
  })
  act(() => controller.dispose())

  act(() => controller.setLifecycle('background'))
  act(() => controller.setLifecycle('foreground'))
  expect(container.textContent).toBe('')
  // Never remounted: the effect ran once (initial render) and nothing after dispose.
  expect(effectMounts).toBe(1)
})

test('StrictMode stays outermost: effects double-invoke on mount and still pause on background', async () => {
  const {render} = await loadHarness()

  let controller!: RenderController
  act(() => {
    controller = render(container, undefined, {reactStrictMode: true})
  })
  // StrictMode is outermost, so it simulates a remount (mount → unmount → mount). If
  // Activity wrapped StrictMode instead, it would govern the mount and suppress this.
  expect(effectMounts).toBe(2)
  expect(effectCleanups).toBe(1)
  expect(container.textContent).toBe('probe:0')

  act(() => setCount(7))
  expect(container.textContent).toBe('probe:7')

  // Backgrounding still tears the live effect down.
  act(() => controller.setLifecycle('background'))
  expect(effectCleanups).toBe(2)
  expect(effectMounts).toBe(2)

  // Foregrounding resumes with state preserved; StrictMode double-invokes this mount too.
  act(() => controller.setLifecycle('foreground'))
  expect(effectMounts).toBe(4)
  expect(container.textContent).toBe('probe:7')
})

test('disposing aborts the root signal on the next tick, not before', async () => {
  const {render} = await loadHarness(ROOT_PROBE)

  let controller!: RenderController
  act(() => {
    controller = render(container)
  })
  expect(rootSignal).toBeInstanceOf(AbortSignal)
  const signal = rootSignal!

  act(() => controller.dispose())
  expect(signal.aborted).toBe(false)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(signal.aborted).toBe(true)
})

test('backgrounding and foregrounding the root keeps its signal', async () => {
  const {render} = await loadHarness(ROOT_PROBE)

  let controller!: RenderController
  act(() => {
    controller = render(container)
  })
  expect(rootSignal).toBeInstanceOf(AbortSignal)
  const signal = rootSignal!

  act(() => controller.setLifecycle('background'))
  act(() => controller.setLifecycle('foreground'))
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(rootSignal).toBe(signal)
  expect(signal.aborted).toBe(false)
})

test('re-rendering the root with new props keeps its signal', async () => {
  const {render} = await loadHarness(ROOT_PROBE)

  act(() => {
    render(container)
  })
  expect(rootSignal).toBeInstanceOf(AbortSignal)
  const signal = rootSignal!

  act(() => {
    render(container, {changed: true})
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(rootSignal).toBe(signal)
  expect(signal.aborted).toBe(false)
})
