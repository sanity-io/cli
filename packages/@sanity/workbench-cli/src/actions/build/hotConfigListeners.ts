export const HOT_CONFIG_LISTENERS = `\
// Dev-only HMR handle. In dev the host loads this module into
// its own page through Module Federation, which keeps returning the first
// evaluation — the host cannot re-import its way to fresh code. So the host
// registers a listener here instead: on every hot update the outgoing module
// hands its live listener set to the incoming module, then replays the
// listeners with the fresh namespace, and the host re-applies the
// config in place (the same pattern view remotes use). When nobody is
// listening — or a listener fails to apply — invalidate() escalates to
// Vite's native full reload, so the page can never keep rendering from
// stale config.
let listeners = new Set()
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
// Internal to the hot chain: the set object travels across updates so the
// unsubscribe closures handed out by any module generation keep deleting
// from the one live set (a copy would orphan them after the first update).
export function _adoptListeners(shared) {
  listeners = shared
}

if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    if (!next || typeof next._adoptListeners !== 'function' || listeners.size === 0) {
      import.meta.hot.invalidate()
      return
    }
    try {
      next._adoptListeners(listeners)
      // Notify a snapshot: a listener may unsubscribe and re-subscribe on the
      // fresh namespace, which (post-adoption) mutates this very set — and a
      // Set iterator revisits re-added entries, so iterating live would loop
      // forever. Entries added mid-loop subscribed to the already-current
      // namespace and need no notification for this update.
      for (const listener of [...listeners]) {
        listener(next)
      }
    } catch {
      import.meta.hot.invalidate()
    }
  })
}
`
