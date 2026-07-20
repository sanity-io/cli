/** How long teardown may run before we stop waiting and force the process to
 * exit — long enough for Vite servers and watchers to close, short enough not to
 * strand a backgrounded process. */
const SHUTDOWN_GRACE_MS = 5000

/**
 * Map a server's bind address to a host that's safe to show in a URL. Bind-only
 * addresses ('0.0.0.0', '::') aren't routable in every browser (notably on
 * Windows), so fall back to localhost for display. The bind address itself is
 * untouched — this only affects the URL printed to the user.
 */
export function toDisplayHost(host: string | undefined): string {
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') {
    return 'localhost'
  }
  return host
}

export interface ServerLifecycle {
  /** Tear everything down exactly once and stop listening for signals. Safe to call more than once. */
  close: () => Promise<void>
  /**
   * Shutdown functions, one per server/resource. Push one as each resource
   * starts; `close` unwinds them in reverse. A throwing closer is swallowed so
   * one bad teardown can't strand the rest.
   */
  closers: Array<() => Promise<void>>
  /** Begin handling Ctrl-C / kill by tearing down, then re-raising the signal so the process still exits. */
  installSignalHandlers: () => void
}

/**
 * Shuts down a command that runs several long-lived servers at once. Both
 * `sanity dev` and `sanity start` start a workbench shell, an app remote, and a
 * registry entry, and every one of them has to be stopped again — on a clean
 * exit, on a startup error, or when the user presses Ctrl-C.
 *
 * How it works:
 *   - Each server adds its own shutdown function to `closers` as it starts.
 *   - `close()` runs them in reverse (last started, first stopped), and only
 *     runs them once no matter how many times it's called.
 *   - `installSignalHandlers()` makes Ctrl-C / kill trigger that same `close()`.
 *
 * Signals need care: Node would normally exit the instant one arrives, but our
 * shutdown is async. So we catch the signal, run `close()`, and only then send
 * the signal on again so the process exits with its usual code. A timer is the
 * escape hatch — if shutdown ever hangs, it forces the exit rather than leaving
 * the process stuck.
 */
export function createServerLifecycle(): ServerLifecycle {
  const closers: ServerLifecycle['closers'] = []

  const runClosers = async () => {
    // Reverse order, so each server is stopped before the one it was started on
    // top of. A closer that throws is ignored so one failure can't block the rest.
    for (const closeResource of closers.splice(0).toReversed()) {
      await closeResource().catch(() => {})
    }
  }

  // `close` can be called more than once — a startup error and then a Ctrl-C, or
  // two signals racing. Keep the first call's promise and hand it back to the
  // rest, so everything is torn down exactly once.
  let teardown: Promise<void> | undefined
  const close = () => {
    teardown ??= (async () => {
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
      await runClosers()
    })()
    return teardown
  }

  function onSignal(signal: NodeJS.Signals) {
    // Force the exit if shutdown doesn't finish in time, so a wedged server
    // can't hang the process forever.
    const graceTimer = setTimeout(() => process.kill(process.pid, signal), SHUTDOWN_GRACE_MS)
    graceTimer.unref()
    // Tear down first, then re-send the signal so the process exits with the
    // code it normally would for this signal.
    void close().finally(() => {
      clearTimeout(graceTimer)
      process.kill(process.pid, signal)
    })
  }

  return {
    close,
    closers,
    installSignalHandlers() {
      process.once('SIGINT', onSignal)
      process.once('SIGTERM', onSignal)
    },
  }
}
