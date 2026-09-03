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
 *
 * ## Render contract v2 — the return value
 *
 * The host keeps an application alive across navigation by hiding it rather than
 * unmounting it, but the host's React cannot pause a remote: the remote owns its
 * own root, so its effects and timers keep running while hidden. So the harness —
 * which sits above everything the user wrote — wraps the user's tree in the
 * *remote's* own `<Activity>` and drives its mode from the host.
 *
 * `render` returns a **callable disposer with the controller attached**:
 *
 * ```js
 * const controller = render(el, props)
 * controller()                          // v1 hosts: the return value IS the disposer
 * controller.dispose()                  // v2 hosts: same thing, named
 * controller.setLifecycle('background')  // pause: Activity mode="hidden"
 * controller.setLifecycle('foreground')  // resume: Activity mode="visible"
 * ```
 *
 * A function object rather than a plain `{dispose, setLifecycle}` because
 * existing hosts call the return value directly; `dispose` is also exposed as
 * a property so a host can destructure.
 *
 * A remote built before this harness change hands back a bare disposer and
 * cannot be paused; the host's guarded `setLifecycle?.()` call covers both.
 */

/**
 * Hot-reload: on an update, re-render every live root through the new module —
 * so whatever it now binds `App` to (a recompiled component, a new studio
 * config) takes effect without a full page reload. The new module starts in the
 * foreground, so a root the host had backgrounded is put back into its lifecycle
 * state before it can run visible. Stripped from prod builds.
 */
const HMR_REMOUNT = `if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    if (!next) return
    for (const [rootElement, args] of renderArgs) {
      rootMap.get(rootElement)?.unmount()
      rootMap.delete(rootElement)
      next.render(rootElement, args.props, args.renderOptions).setLifecycle(args.lifecycle)
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
import * as React from 'react'
import { createRoot } from 'react-dom/client'
${preamble}
const { createElement, StrictMode } = React
// \`Activity\` is stable from React 19.2. The remote bundles its own React, so on
// an older one it is simply absent: the tree renders unwrapped and always
// visible, and \`setLifecycle\` becomes a no-op.
const Activity = React.Activity
${app ? `\nconst App = ${app}\n` : ''}${version ? `\nexport const version = ${version}\n` : ''}
const rootMap = new Map()
const renderArgs = new Map()

function mount(rootElement, args) {
  let root = rootMap.get(rootElement)
  if (!root) {
    root = createRoot(rootElement)
    rootMap.set(rootElement, root)
  }
  let element = createElement(App, args.props)
  if (args?.renderOptions?.reactStrictMode) element = createElement(StrictMode, null, element)
  if (Activity) {
    element = createElement(Activity, { mode: args.lifecycle === 'background' ? 'hidden' : 'visible' }, element)
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
}${hmr ? `\n\n${HMR_REMOUNT}` : ''}
`
}
