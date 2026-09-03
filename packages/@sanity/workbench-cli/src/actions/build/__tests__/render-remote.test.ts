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
    expect(source).toContain(
      'if (args?.renderOptions?.reactStrictMode) element = React.createElement(React.StrictMode, null, element)',
    )
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
      import view from "./view.js"
      // \`Activity\` is stable from React 19.2. The remote bundles its own React, so on
      // an older one it is simply absent: the tree renders unwrapped and always
      // visible, and \`setLifecycle\` becomes a no-op.
      const Activity = React.Activity

      const App = view.components["panel"]

      export const version = view.version

      // Module identity (the federation module id) is provided to App through a React
      // context keyed per React copy on a global slot. The SDK reads this same slot
      // via getDashboardModuleContext(), so the symbol, the key and the value type are
      // a contract. The key is React.createContext rather than the React namespace:
      // bundler interop (esbuild's __toESM in Vite dev pre-bundling) can hand two
      // importers of the same React copy different namespace objects, whereas the
      // createContext function is the same reference in both.
      const moduleSlot = (globalThis[Symbol.for('sanity.os.module')] ??= new WeakMap())
      if (!moduleSlot.has(React.createContext)) moduleSlot.set(React.createContext, React.createContext(undefined))
      const ModuleContext = moduleSlot.get(React.createContext)
      const rootMap = new Map()
      const renderArgs = new Map()

      function mount(rootElement, args) {
        let root = rootMap.get(rootElement)
        if (!root) {
          root = createRoot(rootElement)
          rootMap.set(rootElement, root)
        }
        let element = React.createElement(ModuleContext.Provider, { value: args?.renderOptions?.moduleId }, React.createElement(App, args.props))
        if (args?.renderOptions?.reactStrictMode) element = React.createElement(React.StrictMode, null, element)
        if (Activity) {
          element = React.createElement(Activity, { mode: args.lifecycle === 'background' ? 'hidden' : 'visible' }, element)
        }
        root.render(element)
      }

      export function render(rootElement, props, renderOptions) {
        const args = { lifecycle: 'foreground', props, renderOptions }
        renderArgs.set(rootElement, args)
        mount(rootElement, args)

        // A callable disposer, so hosts predating this contract still work.
        const dispose = () => {
          const root = rootMap.get(rootElement)
          rootMap.delete(rootElement)
          renderArgs.delete(rootElement)
          root?.unmount()
        }
        dispose.dispose = dispose
        dispose.setLifecycle = (lifecycle) => {
          const current = renderArgs.get(rootElement)
          if (!current) return
          current.lifecycle = lifecycle
          mount(rootElement, current)
        }
        return dispose
      }

      if (import.meta.hot) {
        import.meta.hot.accept((next) => {
          if (!next) return
          for (const [rootElement, args] of renderArgs) {
            rootMap.get(rootElement)?.unmount()
            rootMap.delete(rootElement)
            next.render(rootElement, args.props, args.renderOptions).setLifecycle(args.lifecycle)
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
      import App from "./app.js"
      // \`Activity\` is stable from React 19.2. The remote bundles its own React, so on
      // an older one it is simply absent: the tree renders unwrapped and always
      // visible, and \`setLifecycle\` becomes a no-op.
      const Activity = React.Activity

      // Module identity (the federation module id) is provided to App through a React
      // context keyed per React copy on a global slot. The SDK reads this same slot
      // via getDashboardModuleContext(), so the symbol, the key and the value type are
      // a contract. The key is React.createContext rather than the React namespace:
      // bundler interop (esbuild's __toESM in Vite dev pre-bundling) can hand two
      // importers of the same React copy different namespace objects, whereas the
      // createContext function is the same reference in both.
      const moduleSlot = (globalThis[Symbol.for('sanity.os.module')] ??= new WeakMap())
      if (!moduleSlot.has(React.createContext)) moduleSlot.set(React.createContext, React.createContext(undefined))
      const ModuleContext = moduleSlot.get(React.createContext)
      const rootMap = new Map()
      const renderArgs = new Map()

      function mount(rootElement, args) {
        let root = rootMap.get(rootElement)
        if (!root) {
          root = createRoot(rootElement)
          rootMap.set(rootElement, root)
        }
        let element = React.createElement(ModuleContext.Provider, { value: args?.renderOptions?.moduleId }, React.createElement(App, args.props))
        if (args?.renderOptions?.reactStrictMode) element = React.createElement(React.StrictMode, null, element)
        if (Activity) {
          element = React.createElement(Activity, { mode: args.lifecycle === 'background' ? 'hidden' : 'visible' }, element)
        }
        root.render(element)
      }

      export function render(rootElement, props, renderOptions) {
        const args = { lifecycle: 'foreground', props, renderOptions }
        renderArgs.set(rootElement, args)
        mount(rootElement, args)

        // A callable disposer, so hosts predating this contract still work.
        const dispose = () => {
          const root = rootMap.get(rootElement)
          rootMap.delete(rootElement)
          renderArgs.delete(rootElement)
          root?.unmount()
        }
        dispose.dispose = dispose
        dispose.setLifecycle = (lifecycle) => {
          const current = renderArgs.get(rootElement)
          if (!current) return
          current.lifecycle = lifecycle
          mount(rootElement, current)
        }
        return dispose
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

/** A React whose namespace has no `Activity` — i.e. anything before 19.2. */
const REACT_WITHOUT_ACTIVITY = `export {createContext, createElement, StrictMode} from 'react'\n`

interface RenderController {
  (): void
  dispose(): void
  setLifecycle(lifecycle: 'background' | 'foreground'): void
}

interface Harness {
  render(
    rootElement: Element,
    props?: unknown,
    renderOptions?: {reactStrictMode?: boolean},
  ): RenderController
}

let moduleCount = 0

async function loadHarness({react = 'react'}: {react?: string} = {}): Promise<Harness> {
  const source = renderRemote({
    app: 'globalThis.__RENDER_REMOTE_PROBE__',
    preamble: '',
  }).replace("from 'react'", `from ${JSON.stringify(react)}`)

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
  fs.writeFileSync(path.join(TMP_DIR, 'react-without-activity.js'), REACT_WITHOUT_ACTIVITY)
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

  act(() => controller.dispose())
  expect(effectCleanups).toBe(2)
  expect(container.textContent).toBe('')
})

test('the return value is the disposer itself, for hosts predating the controller', async () => {
  const {render} = await loadHarness()

  let dispose!: RenderController
  act(() => {
    dispose = render(container)
  })

  expect(typeof dispose).toBe('function')
  expect(dispose.dispose).toBe(dispose)

  act(() => dispose())
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
  expect(container.textContent).toBe('')
  expect(effectMounts).toBe(1)
})

test('a React without `Activity` still renders, and `setLifecycle` is a no-op', async () => {
  const {render} = await loadHarness({react: './react-without-activity.js'})

  let controller!: RenderController
  act(() => {
    controller = render(container)
  })
  expect(container.textContent).toBe('probe:0')

  act(() => controller.setLifecycle('background'))
  expect(effectCleanups).toBe(0)
  expect(container.textContent).toBe('probe:0')

  act(() => controller.dispose())
  expect(container.textContent).toBe('')
})

test('hot updates carry the lifecycle over to the new module', () => {
  const source = renderRemote({app: 'App', hmr: true, preamble: ''})

  expect(source).toContain(
    'next.render(rootElement, args.props, args.renderOptions).setLifecycle(args.lifecycle)',
  )
})
