// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

import {act, createElement, useEffect, useState} from 'react'
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

      // The SDK reads this slot via getDashboardModuleContext(), so its symbol, key and
      // value are a contract. Keyed by createContext, not the React namespace: Vite dev
      // pre-bundling can give two importers of one React copy different namespaces.
      const moduleSlot = (globalThis[Symbol.for('sanity.os.module')] ??= new WeakMap())
      if (!moduleSlot.has(React.createContext)) moduleSlot.set(React.createContext, React.createContext(undefined))
      const ModuleContext = moduleSlot.get(React.createContext)
      const rootMap = new Map()
      // A shared default sheet can overwrite another app's global rules; each root needs its own sheet.
      const styleTargets = new Map()
      const renderArgs = new Map()

      function mount(rootElement, args) {
        let root = rootMap.get(rootElement)
        if (!root) {
          root = createRoot(rootElement, args?.renderOptions?.rootOptions)
          rootMap.set(rootElement, root)
          if (StyleSheetManager) {
            const target = rootElement.ownerDocument.createElement('sanity-styles')
            // React can replace the mount node's contents; keep its stylesheet outside that node.
            rootElement.ownerDocument.head.appendChild(target)
            styleTargets.set(rootElement, target)
          }
        }
        let element = React.createElement(ModuleContext.Provider, { value: args?.renderOptions?.moduleId }, React.createElement(App, args.props))
        if (StyleSheetManager) element = React.createElement(StyleSheetManager, { target: styleTargets.get(rootElement) }, element)
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

      // The SDK reads this slot via getDashboardModuleContext(), so its symbol, key and
      // value are a contract. Keyed by createContext, not the React namespace: Vite dev
      // pre-bundling can give two importers of one React copy different namespaces.
      const moduleSlot = (globalThis[Symbol.for('sanity.os.module')] ??= new WeakMap())
      if (!moduleSlot.has(React.createContext)) moduleSlot.set(React.createContext, React.createContext(undefined))
      const ModuleContext = moduleSlot.get(React.createContext)
      const rootMap = new Map()
      // A shared default sheet can overwrite another app's global rules; each root needs its own sheet.
      const styleTargets = new Map()
      const renderArgs = new Map()

      function mount(rootElement, args) {
        let root = rootMap.get(rootElement)
        if (!root) {
          root = createRoot(rootElement, args?.renderOptions?.rootOptions)
          rootMap.set(rootElement, root)
          if (StyleSheetManager) {
            const target = rootElement.ownerDocument.createElement('sanity-styles')
            // React can replace the mount node's contents; keep its stylesheet outside that node.
            rootElement.ownerDocument.head.appendChild(target)
            styleTargets.set(rootElement, target)
          }
        }
        let element = React.createElement(ModuleContext.Provider, { value: args?.renderOptions?.moduleId }, React.createElement(App, args.props))
        if (StyleSheetManager) element = React.createElement(StyleSheetManager, { target: styleTargets.get(rootElement) }, element)
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

async function loadHarness(): Promise<Harness> {
  const source = renderRemote({
    app: 'globalThis.__RENDER_REMOTE_PROBE__',
    preamble: '',
  })

  const file = path.join(TMP_DIR, `harness-${moduleCount++}.js`)
  fs.writeFileSync(file, source)
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Harness
}

let effectMounts = 0
let effectCleanups = 0
let setCount: (count: number) => void

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

let container: HTMLDivElement

beforeAll(() => {
  ;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as {__RENDER_REMOTE_PROBE__?: unknown}).__RENDER_REMOTE_PROBE__ = Probe
  fs.mkdirSync(TMP_DIR, {recursive: true})
})

afterAll(() => {
  fs.rmSync(TMP_DIR, {force: true, recursive: true})
})

beforeEach(() => {
  effectMounts = 0
  effectCleanups = 0
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
