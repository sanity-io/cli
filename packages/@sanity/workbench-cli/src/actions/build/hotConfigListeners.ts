export const HOT_CONFIG_LISTENERS = `\
// The host keeps its first Module Federation load and subscribes here. hot.data
// shares listeners with later instances, even one whose import threw, so a broken
// save keeps the last good config. Without a listener, invalidate() reloads.
const listeners = import.meta.hot ? (import.meta.hot.data.listeners ??= new Set()) : new Set()
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    // Vite passes no module when the update threw; it has already logged why.
    if (!next) {
      return
    }

    if (listeners.size === 0) {
      import.meta.hot.invalidate()
      return
    }
    try {
      // A snapshot, because a listener may re-subscribe on the fresh module.
      for (const listener of [...listeners]) {
        listener(next)
      }
    } catch {
      import.meta.hot.invalidate()
    }
  })
}
`
