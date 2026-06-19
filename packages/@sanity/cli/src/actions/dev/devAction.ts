import {styleText} from 'node:util'

import {getCliConfigUncached, isWorkbenchApp} from '@sanity/cli-core'
import {type ViteDevServer} from 'vite'

import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
import {startDevServerRegistration} from './registration/startDevServerRegistration.js'
import {startAppDevServer} from './servers/startAppDevServer.js'
import {startStudioDevServer} from './servers/startStudioDevServer.js'
import {type DevActionOptions, type StartDevServerResult} from './types.js'
import {startWorkbenchDevServer} from './workbench/startWorkbenchDevServer.js'

const noop = async () => {}

/**
 * How long a signal-triggered teardown may run before the process force-exits
 * by re-raising the signal — generous enough for Vite servers and watchers to
 * close, short enough not to strand a backgrounded process holding the ports.
 */
const SHUTDOWN_GRACE_MS = 5000

// Bind-only addresses ('0.0.0.0', '::') aren't routable URLs in every
// browser (notably on Windows), so the displayed URL falls back to
// localhost. The bind address itself is untouched — listening and the
// lock file keep whatever the user configured.
function toDisplayHost(host: string | undefined): string {
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') {
    return 'localhost'
  }
  return host
}

/**
 * Orchestrates the dev servers required by the process. It will attempt to run a workbench
 * dev-server and, if successful, will run the app/studio dev server on the next available port.
 * If the workbench dev-server fails to start for an expected reason, e.g. because there is already
 * a workbench instance running or the workbench package is unavailable, it will run the app/studio
 * dev server on the configured port.
 */
export async function devAction(options: DevActionOptions): Promise<{close: () => Promise<void>}> {
  const {cliConfig, flags, output, workDir} = options

  const {httpHost, httpPort} = getSharedServerConfig({
    cliConfig,
    flags: {host: flags.host, port: flags.port},
    workDir,
  })

  /**
   * The workbench remote is the app that renders "workbench ready" apps, thereby it can't render itself.
   * But it still wants to be deployed as a singleton in the sanity ecosystem. Therefore, this internal flag
   * allows us to develop the workbench remote correctly – as a standalone app.
   */
  const isWorkbenchRemote =
    isWorkbenchApp(cliConfig?.app) && process.env.SANITY_INTERNAL_IS_WORKBENCH_REMOTE === 'true'

  const {
    close: closeWorkbenchServer,
    httpHost: workbenchHost,
    workbenchAvailable,
    workbenchPort,
  } = isWorkbenchRemote
    ? {close: noop, httpHost, workbenchAvailable: false, workbenchPort: httpPort}
    : await startWorkbenchDevServer({...options, httpHost, httpPort})

  // A running workbench claims the configured port, so the app server binds the
  // next one — passed explicitly rather than by rewriting the shared flags.
  // Without a workbench the app server resolves its port from flags/env/config
  // downstream, exactly as it did before workbench existed.
  const appOptions: DevActionOptions = workbenchAvailable
    ? {...options, httpPort: workbenchPort + 1, workbenchAvailable}
    : {...options, workbenchAvailable}

  let closeAppDevServer: () => Promise<void> = noop

  // Takes the config as a param so a rebuild can feed a freshly-loaded one.
  const startApp = async (config: DevActionOptions['cliConfig']): Promise<StartDevServerResult> => {
    const result = options.isApp
      ? await startAppDevServer({...appOptions, cliConfig: config})
      : await startStudioDevServer({...appOptions, cliConfig: config})
    closeAppDevServer = result.started ? result.close : noop
    return result
  }

  let initial: StartDevServerResult
  try {
    initial = await startApp(cliConfig)
  } catch (err) {
    await closeWorkbenchServer()
    throw err
  }

  if (!initial.started) {
    // The server has already reported why (e.g. missing organization ID).
    return {close: closeWorkbenchServer}
  }
  const {server} = initial

  // Adding/removing a view or service in `sanity.cli.ts` during dev requires
  // rebuilding the federation remote: its module-federation `exposes` map +
  // codegen artifacts are computed once at server start, so a newly-declared
  // interface has no expose until the server is recreated. `server.restart()`
  // can't do it — it re-uses the inline config — so we tear the app server
  // down and bring it back up with a freshly-loaded config. The workbench page
  // then reloads (driven by the registry watch in the workbench server) to
  // re-fetch the rebuilt remote. A view/service *source* edit doesn't change
  // the interface set, so it stays on the HMR path untouched. Studios declare
  // views/services the same way (only `entry` is rejected, FR-026), so they
  // get the same rebuild. The returned-server / thrown-failed-restart contract
  // is documented on `onInterfaceSetChange` in startDevServerRegistration.

  // Declared ahead of `runRebuild`, which the watcher's initial background
  // extraction can invoke before the statements below it have run.
  let closed = false

  const runRebuild = async (): Promise<ViteDevServer> => {
    // The watcher only learns about shutdown when its own close runs, late in
    // the teardown sequence — refuse here so a config save during shutdown
    // can't boot a replacement server nobody owns. Checked before the first
    // await so a rebuild can't start after close() has read `rebuildInFlight`.
    if (closed) {
      throw new Error('Dev server is shutting down')
    }
    const freshConfig = await getCliConfigUncached(workDir)
    await closeAppDevServer()
    const result = await startApp(freshConfig)
    if (!result.started) {
      // The server already reported why (e.g. organizationId was removed).
      throw new Error('Dev server did not restart after the view/service change')
    }
    return result.server
  }

  // `closeAppDevServer` is repointed at the replacement server only after
  // `startApp` resolves — a close() racing a rebuild would tear down the old
  // (already-closed) server and leave the replacement running with no owner,
  // so close() waits on the rebuild in flight. Rejections are owned by the
  // watcher (warn + retry on next save); the tracked copy swallows them so
  // close() can't reject.
  let rebuildInFlight: Promise<unknown> = Promise.resolve()
  const onInterfaceSetChange = (): Promise<ViteDevServer> => {
    const rebuild = runRebuild()
    rebuildInFlight = rebuild.catch(() => {})
    return rebuild
  }

  // Workbench is opted into solely by calling `unstable_defineApp` — its
  // branded identity is the only signal. The workbench remote is the exception:
  // it's the shell itself, not a dock app, so it never registers into the
  // shared workbench registry.
  let registration: Awaited<ReturnType<typeof startDevServerRegistration>> | undefined
  try {
    registration =
      isWorkbenchApp(cliConfig?.app) && !isWorkbenchRemote
        ? await startDevServerRegistration({
            cliConfig,
            isApp: options.isApp,
            onInterfaceSetChange,
            output,
            server,
            workDir,
          })
        : undefined
  } catch (err) {
    // Registration runs only after both servers are already up. If it throws
    // (e.g. `deriveInterfaces` rejects), tear them down before rethrowing —
    // otherwise the workbench lock and dev servers leak until the next run.
    await Promise.allSettled([closeWorkbenchServer(), closeAppDevServer()])
    throw err
  }

  if (workbenchAvailable) {
    const workbenchUrl = `http://${toDisplayHost(workbenchHost)}:${workbenchPort}`
    const addr = server.httpServer?.address()
    const appPort = typeof addr === 'object' && addr ? addr.port : server.config.server.port
    output.log(
      `Workbench dev server started at ${styleText(['blue', 'underline'], workbenchUrl)} (app on port ${appPort})`,
    )
  }

  // Single-flight: SIGINT followed by SIGTERM (each signal has its own `once`
  // handler), or a signal racing the caller's own close(), must share one
  // teardown instead of double-closing every server.
  let closing: Promise<void> | undefined
  const close = () => {
    closing ??= (async () => {
      closed = true
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
      await rebuildInFlight
      await Promise.allSettled([registration?.close(), closeWorkbenchServer(), closeAppDevServer()])
    })()
    return closing
  }

  // Ensure the workbench lock file and registry entries are cleaned up on
  // abrupt shutdown. The registry is self-healing (stale PIDs are pruned on
  // next read), but eager cleanup avoids the detect-prune-retry cycle.
  // Plain projects have no lock or registry entry, so they keep the default
  // signal handling (and exit codes) they had before workbench existed.
  //
  // Trapping the signal disables Node's default exit, and a finished teardown
  // doesn't guarantee an empty event loop (keep-alive sockets, an extraction
  // worker mid-run) — without an explicit exit the process lingers, holding
  // its ports, while the shell prompt returns. Re-raising after teardown
  // restores the default termination (the `once` handler is gone by then),
  // with conventional signal exit semantics.
  const onSignal = (signal: NodeJS.Signals) => {
    // Backstop for a teardown that never settles (a wedged socket or watcher):
    // force the exit once the grace period elapses. Cleared on the normal path
    // so the re-raise fires exactly once; `unref` keeps the timer from holding
    // the process open by itself.
    const graceTimer = setTimeout(() => process.kill(process.pid, signal), SHUTDOWN_GRACE_MS)
    graceTimer.unref()
    void close().finally(() => {
      clearTimeout(graceTimer)
      process.kill(process.pid, signal)
    })
  }
  if (workbenchAvailable || registration) {
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)
  }

  return {close}
}
