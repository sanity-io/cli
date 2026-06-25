import {styleText} from 'node:util'

import {type CliConfig, type Output} from '@sanity/cli-core'

import {type AppServerResult, startAppServerSupervisor} from './appServerSupervisor.js'
import {type DevServerManifest} from './registry.js'
import {startDevServerRegistration} from './startDevServerRegistration.js'
import {
  startWorkbenchDevServer,
  startWorkbenchRemoteCoordinator,
} from './startWorkbenchDevServer.js'

/** How long teardown runs before re-raising the signal to force-exit — enough for
 * Vite/watchers to close, short enough not to strand a backgrounded process. */
const SHUTDOWN_GRACE_MS = 5000

// Bind-only addresses ('0.0.0.0', '::') aren't routable in every browser (notably
// Windows); the displayed URL falls back to localhost. The bind address is untouched.
function toDisplayHost(host: string | undefined): string {
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') {
    return 'localhost'
  }
  return host
}

export interface StartWorkbenchDevOptions {
  /** Resolved app id for the registry entry (the CLI owns id resolution). */
  appId: string | undefined
  /** Directory for the workbench Vite server's dependency cache. */
  cacheDir: string
  /** CLI-domain `app.id`/`deployment.appId` deprecation check, run before registering. */
  checkForDeprecatedAppId: () => void
  cliConfig: CliConfig
  /** Extract the project manifest to inline into the registry (studio-vs-app handled by the CLI). */
  extractManifest: (params: {
    configPath: string
    workDir: string
  }) => Promise<DevServerManifest['manifest']>
  httpHost: string | undefined
  httpPort: number
  isApp: boolean
  output: Output
  reactStrictMode: boolean
  /** Start the app/studio dev server — the CLI owns the server, this orchestrates it. */
  startAppServer: (params: {
    announceUrl: boolean
    cliConfig: CliConfig
    httpPort: number
  }) => Promise<AppServerResult>
  workDir: string
}

/**
 * Orchestrate the dev servers a workbench project needs: a singleton workbench
 * Vite server plus the app/studio dev server it renders, wired to the dev-server
 * registry so view/service edits re-sync live.
 *
 * A running workbench claims the configured port, so the app server binds the
 * next one. If the workbench can't start (package or port unavailable), the app
 * server falls back to the configured port and announces its own URL, exactly as
 * a plain `sanity dev` would.
 */
export async function startWorkbenchDev(
  options: StartWorkbenchDevOptions,
): Promise<{close: () => Promise<void>}> {
  const {
    appId,
    cacheDir,
    checkForDeprecatedAppId,
    cliConfig,
    extractManifest,
    httpHost,
    httpPort,
    isApp,
    output,
    reactStrictMode,
    startAppServer,
    workDir,
  } = options

  // The remote can't render itself, so it runs as a plain app server (not the
  // shell) that still claims the lock and bridges the registry, so app
  // `sanity dev`s register into it.
  if (process.env.SANITY_INTERNAL_IS_WORKBENCH_REMOTE === 'true') {
    const remote = await startAppServer({announceUrl: true, cliConfig, httpPort})
    if (!remote.started) return {close: async () => {}}

    const addr = remote.server.httpServer?.address()
    const port =
      (typeof addr === 'object' && addr ? addr.port : remote.server.config.server.port) ?? httpPort
    const coordinator = startWorkbenchRemoteCoordinator({httpHost, port, server: remote.server})

    return {
      close: async () => {
        await coordinator.close()
        await remote.close()
      },
    }
  }

  // Unwound in reverse on any failure or on close(): the watcher stops before
  // the app server, and the supervisor waits out an in-flight rebuild.
  const closers: Array<() => Promise<void>> = []
  const disposeAll = async () => {
    for (const close of closers.splice(0).toReversed()) {
      await close().catch(() => {})
    }
  }

  const workbench = await startWorkbenchDevServer({
    cacheDir,
    cliConfig,
    httpHost,
    httpPort,
    output,
    reactStrictMode,
    workDir,
  })
  closers.push(workbench.close)

  // A running workbench owns the configured port; the app server takes the next.
  // Without one it claims the configured port and announces its own URL.
  const appPort = workbench.workbenchAvailable ? workbench.workbenchPort + 1 : httpPort
  const announceUrl = !workbench.workbenchAvailable

  let closing: Promise<void> | undefined
  const close = () => {
    closing ??= (async () => {
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
      await disposeAll()
    })()
    return closing
  }

  const supervised = await startAppServerSupervisor({
    cliConfig,
    start: (config) => startAppServer({announceUrl, cliConfig: config, httpPort: appPort}),
    workDir,
  }).catch(async (err) => {
    await disposeAll()
    throw err
  })

  if (!supervised.started) {
    // The app server already reported why (e.g. missing organization id). Hand
    // back a close that releases the workbench lock; nothing else came up.
    return {close}
  }
  const {supervisor} = supervised
  closers.push(supervisor.close)

  try {
    // The deprecated-id check and manifest extractor are CLI-domain, injected here.
    checkForDeprecatedAppId()
    const registration = await startDevServerRegistration({
      appId,
      cliConfig,
      extractManifest,
      isApp,
      onInterfaceSetChange: () => supervisor.rebuild(),
      output,
      server: supervisor.server,
      workDir,
    })
    closers.push(registration.close)
  } catch (err) {
    // Registration runs after both servers are up; a failure here would leak the
    // workbench lock and dev servers without this teardown.
    await disposeAll()
    throw err
  }

  if (workbench.workbenchAvailable) {
    const workbenchUrl = `http://${toDisplayHost(workbench.httpHost)}:${workbench.workbenchPort}`
    const addr = supervisor.server.httpServer?.address()
    const port = typeof addr === 'object' && addr ? addr.port : supervisor.server.config.server.port
    output.log(
      `Workbench dev server started at ${styleText(['blue', 'underline'], workbenchUrl)} (app on port ${port})`,
    )
  }

  // Trapping the signal disables Node's default exit, and a finished teardown
  // doesn't guarantee an empty event loop (keep-alive sockets, an extraction
  // worker mid-run) — so re-raise after teardown to restore conventional signal
  // exit semantics. A backstop timer force-exits if teardown wedges.
  function onSignal(signal: NodeJS.Signals) {
    const graceTimer = setTimeout(() => process.kill(process.pid, signal), SHUTDOWN_GRACE_MS)
    graceTimer.unref()
    void close().finally(() => {
      clearTimeout(graceTimer)
      process.kill(process.pid, signal)
    })
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  return {close}
}
