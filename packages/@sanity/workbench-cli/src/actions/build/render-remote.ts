/**
 * Every entry the federation build generates — the studio/app remote entries
 * and the per-view-component artifacts — is the same thing: a *render-contract
 * module* that owns its own React, renders into a host node via
 * `render(rootElement, props, renderOptions)`, and returns a disposer.
 *
 * They differ only in *what* they render. So each module binds an `App` to that
 * (the SDK app, a `Studio` with config, a view component) and the render body —
 * identical everywhere — just renders `App`. {@link renderRemote} assembles a
 * module from a `preamble` (its imports), the `app` expression, and, optionally,
 * the shared HMR snippet.
 */

/**
 * Hot-reload: on an update, re-render every live root through the new module —
 * so whatever it now binds `App` to (a recompiled component, a new studio
 * config) takes effect without a full page reload. Stripped from prod builds.
 */
const HMR_REMOUNT = `if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    if (!next) return
    for (const [rootElement, args] of renderArgs) {
      rootMap.get(rootElement)?.unmount()
      rootMap.delete(rootElement)
      next.render(rootElement, args.props, args.renderOptions)
    }
  })
}`

/**
 * Assemble a render-contract module: its `preamble` (imports), the `App` it
 * renders, the render body, and — when `hmr` — the shared HMR snippet.
 *
 * - `app` is the expression bound to `App`; omit it when the preamble imports an
 *   `App` directly (the SDK-app entry).
 * - `version` is an expression the host reads to check contract compatibility;
 *   omit it when the module carries no version (the studio/app entries).
 */
export function renderRemote({
  app,
  hmr = false,
  preamble,
  version,
}: {
  app?: string
  hmr?: boolean
  preamble: string
  version?: string
}): string {
  return `\
// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
import { createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
${preamble}
${app ? `\nconst App = ${app}\n` : ''}${version ? `\nexport const version = ${version}\n` : ''}
const rootMap = new Map()
const renderArgs = new Map()

function mount(rootElement, args) {
  let root = rootMap.get(rootElement)
  if (!root) {
    root = createRoot(rootElement)
    rootMap.set(rootElement, root)
  }
  const element = createElement(App, args.props)
  root.render(args?.renderOptions?.reactStrictMode ? createElement(StrictMode, null, element) : element)
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
}${hmr ? `\n\n${HMR_REMOUNT}` : ''}
`
}
