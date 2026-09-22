import {describe, expect, test} from 'vitest'

import {type InterfaceArtifact, viewArtifacts} from '../artifact.js'

// Test stub for the build-supplied `resolveImport` — turns an app `src` into a
// specifier relative to the artifact. The emitter only threads it through
// `JSON.stringify`, so the exact resolver shape isn't what these tests pin.
const resolveImport = (src: string) => `../../${src.replace('./', '')}`

const view = (overrides: Partial<InterfaceArtifact> = {}): InterfaceArtifact => ({
  name: 'feed',
  src: './src/feed.tsx',
  surface: 'panel',
  ...overrides,
})

describe('viewArtifacts', () => {
  test('expands a multi-component surface into one artifact per component', () => {
    const artifacts = viewArtifacts([view({name: 'feed', surface: 'panel'})])
    expect(artifacts.map((artifact) => artifact.expose)).toEqual([
      './views/feed/title',
      './views/feed/panel',
    ])
    expect(artifacts.map((artifact) => artifact.path)).toEqual([
      'views/feed/title.js',
      'views/feed/panel.js',
    ])
  })

  // Binding is the one part that varies per component: each artifact must select
  // its own component (or the bare function) as the App the render contract renders.
  test('binds each component of a surface as its own App', () => {
    const [title, panel] = viewArtifacts([view({name: 'feed', surface: 'panel'})])
    expect(title.source({resolveImport})).toContain(
      `const App = typeof view.components === 'function' ? view.components : view.components["title"]`,
    )
    expect(panel.source({resolveImport})).toContain(
      `const App = typeof view.components === 'function' ? view.components : view.components["panel"]`,
    )
  })

  test('binds a single-component surface without special-casing it', () => {
    const [tile] = viewArtifacts([view({name: 'feed', surface: 'tile'})])
    expect(tile.source({resolveImport})).toContain(
      `const App = typeof view.components === 'function' ? view.components : view.components["tile"]`,
    )
  })

  // Pin the whole emitted view module: it imports the view src, exposes the
  // view's version, and renders behind an HMR boundary. A fragment check can't
  // catch a broken join between those parts.
  test('emits a render-contract module bound to the view behind an HMR boundary', () => {
    const [title] = viewArtifacts([view({name: 'feed', src: './src/feed.tsx', surface: 'panel'})])
    expect(title.source({resolveImport})).toMatchInlineSnapshot(`
      "// This file is auto-generated on 'sanity build' / 'sanity dev'
      // Modifications to this file are automatically discarded
      import * as React from 'react'
      import { createRoot } from 'react-dom/client'
      const StyleSheetManager = undefined
      import view from "../../src/feed.tsx"

      const App = typeof view.components === 'function' ? view.components : view.components["title"]

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
          // Unmount first so effect cleanup can still reach this root's stylesheet.
          styleTargets.get(rootElement)?.remove()
          styleTargets.delete(rootElement)
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

  test('expands a single-component surface into a lone artifact', () => {
    const artifacts = viewArtifacts([view({name: 'browser', surface: 'asset_source'})])
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].expose).toBe('./views/browser/asset_source')
    expect(artifacts[0].path).toBe('views/browser/asset_source.js')
  })

  test('produces nothing for a surface that exposes no components', () => {
    expect(viewArtifacts([view({surface: 'window'})])).toEqual([])
  })

  test('expands many views, preserving order', () => {
    const artifacts = viewArtifacts([
      view({name: 'feed', surface: 'tile'}),
      view({name: 'browser', surface: 'asset_source'}),
    ])
    expect(artifacts.map((artifact) => artifact.expose)).toEqual([
      './views/feed/tile',
      './views/browser/asset_source',
    ])
  })

  test('returns nothing for an empty view list', () => {
    expect(viewArtifacts([])).toEqual([])
  })
})
