import {describe, expect, test} from 'vitest'

import {renderRemote} from '../render-remote.js'

describe('renderRemote', () => {
  test('exports a render entry that mounts the bound App into the host node', () => {
    const source = renderRemote({
      app: 'view.components["panel"]',
      preamble: 'import view from "./view.js"',
    })
    expect(source).toContain('const App = view.components["panel"]')
    expect(source).toContain('export function render(rootElement, props, renderOptions)')
    expect(source).toContain('createElement(App, args.props)')
    expect(source).toContain(
      'reactStrictMode ? React.createElement(React.StrictMode, null, element)',
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

      const App = view.components["panel"]

      export const version = view.version

      // Module identity (the federation module id) is provided to App through a React
      // context keyed per React copy on a global slot. The SDK reads this same slot
      // via getDashboardModuleContext(), so the symbol and value type are a contract.
      const moduleSlot = (globalThis[Symbol.for('sanity.os.module')] ??= new WeakMap())
      if (!moduleSlot.has(React)) moduleSlot.set(React, React.createContext(undefined))
      const ModuleContext = moduleSlot.get(React)
      const rootMap = new Map()
      const renderArgs = new Map()

      function mount(rootElement, args) {
        let root = rootMap.get(rootElement)
        if (!root) {
          root = createRoot(rootElement)
          rootMap.set(rootElement, root)
        }
        const element = React.createElement(ModuleContext.Provider, { value: args?.renderOptions?.moduleId }, React.createElement(App, args.props))
        root.render(args?.renderOptions?.reactStrictMode ? React.createElement(React.StrictMode, null, element) : element)
      }

      export function render(rootElement, props, renderOptions) {
        const args = { props, renderOptions }
        renderArgs.set(rootElement, args)
        mount(rootElement, args)
        return () => {
          const root = rootMap.get(rootElement)
          rootMap.delete(rootElement)
          renderArgs.delete(rootElement)
          root?.unmount()
        }
      }

      if (import.meta.hot) {
        import.meta.hot.accept((next) => {
          if (!next) return
          for (const [rootElement, args] of renderArgs) {
            rootMap.get(rootElement)?.unmount()
            rootMap.delete(rootElement)
            next.render(rootElement, args.props, args.renderOptions)
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

      // Module identity (the federation module id) is provided to App through a React
      // context keyed per React copy on a global slot. The SDK reads this same slot
      // via getDashboardModuleContext(), so the symbol and value type are a contract.
      const moduleSlot = (globalThis[Symbol.for('sanity.os.module')] ??= new WeakMap())
      if (!moduleSlot.has(React)) moduleSlot.set(React, React.createContext(undefined))
      const ModuleContext = moduleSlot.get(React)
      const rootMap = new Map()
      const renderArgs = new Map()

      function mount(rootElement, args) {
        let root = rootMap.get(rootElement)
        if (!root) {
          root = createRoot(rootElement)
          rootMap.set(rootElement, root)
        }
        const element = React.createElement(ModuleContext.Provider, { value: args?.renderOptions?.moduleId }, React.createElement(App, args.props))
        root.render(args?.renderOptions?.reactStrictMode ? React.createElement(React.StrictMode, null, element) : element)
      }

      export function render(rootElement, props, renderOptions) {
        const args = { props, renderOptions }
        renderArgs.set(rootElement, args)
        mount(rootElement, args)
        return () => {
          const root = rootMap.get(rootElement)
          rootMap.delete(rootElement)
          renderArgs.delete(rootElement)
          root?.unmount()
        }
      }
      "
    `)
  })
})
