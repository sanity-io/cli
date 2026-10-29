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
      closeRoot(rootElement)
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
// The SDK reads these slots via getDashboardModuleContext() and getDashboardRootContext(),
// so their symbols, key and values are a contract. Keyed by createContext, not the React
// namespace: Vite dev pre-bundling can give two importers of one React copy different namespaces.
function sharedContext(name) {
  const slot = (globalThis[Symbol.for(name)] ??= new WeakMap())
  if (!slot.has(React.createContext)) slot.set(React.createContext, React.createContext(undefined))
  return slot.get(React.createContext)
}
const ModuleContext = sharedContext('sanity.os.module')
// Older SDKs read ModuleContext as a plain string, so the root's signal has its own context.
const RootContext = sharedContext('sanity.os.root')
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
    rootContexts.set(rootElement, { controller, value: { signal: controller.signal } })
    if (StyleSheetManager) {
      const target = rootElement.ownerDocument.createElement('sanity-styles')
      // React can replace the mount node's contents; keep its stylesheet outside that node.
      rootElement.ownerDocument.head.appendChild(target)
      styleTargets.set(rootElement, target)
      stylisPlugins.set(rootElement, [uniqueStylisPlugin()])
    }
  }
  let element = React.createElement(RootContext.Provider, { value: rootContexts.get(rootElement).value }, React.createElement(App, args.props))
  element = React.createElement(ModuleContext.Provider, { value: args?.renderOptions?.moduleId }, element)
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
}${hmr ? `\n\n${HMR_REMOUNT}` : ''}
`
}
