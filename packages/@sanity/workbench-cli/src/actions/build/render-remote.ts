/**
 * Every generated entry (studio, SDK app, view artifacts) shares one render body
 * so the host can drive them all the same way; only the `App` they bind differs.
 * The workbench host depends on `render`'s signature and return shape, so change
 * them together.
 */

// Re-renders through the new module so edits apply without a page reload. The
// new module mounts in the foreground, so reapply the host's lifecycle. The host
// still holds this module's controller, so it forwards to the new one.
const HMR_REMOUNT = `if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    if (!next) return
    for (const [rootElement, args] of renderArgs) {
      rootMap.get(rootElement)?.unmount()
      rootMap.delete(rootElement)
      args.next = next.render(rootElement, args.props, args.renderOptions)
      args.next.setLifecycle(args.lifecycle)
    }
  })
}`

/**
 * - `app`: omit when the preamble imports `App` itself (the SDK-app entry).
 * - `version`: lets the host check view/service contract compatibility.
 */
export function renderRemote({
  app,
  hmr = false,
  isolateStyles = false,
  preamble,
  version,
}: {
  app?: string
  hmr?: boolean
  isolateStyles?: boolean
  preamble: string
  version?: string
}): string {
  // Keep apps without styled-components buildable; the unused branch is removed from their bundle.
  const stylesheetImport = isolateStyles
    ? "import { StyleSheetManager } from 'styled-components'"
    : 'const StyleSheetManager = undefined'

  return `\
// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
import * as React from 'react'
import { createRoot } from 'react-dom/client'
${stylesheetImport}
${preamble}
${app ? `\nconst App = ${app}\n` : ''}${version ? `\nexport const version = ${version}\n` : ''}
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
}${hmr ? `\n\n${HMR_REMOUNT}` : ''}
`
}
