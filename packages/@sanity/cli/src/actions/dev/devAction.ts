import {styleText} from 'node:util'

import {checkForDeprecatedAppId, getAppId} from '../../util/appId.js'
import {type CoreAppManifest, type StudioManifest} from '../manifest/types.js'
import {registerDevServer} from './devServerRegistry.js'
import {extractCoreAppManifest, extractStudioManifest} from './extractDevServerManifest.js'
import {startAppDevServer} from './startAppDevServer.js'
import {startDevManifestWatcher} from './startDevManifestWatcher.js'
import {startStudioDevServer} from './startStudioDevServer.js'
import {startWorkbenchDevServer} from './startWorkbenchDevServer.js'
import {type DevActionOptions} from './types.js'

const noop = async () => {}
const syncNoop = () => {}

export async function devAction(options: DevActionOptions): Promise<{close: () => Promise<void>}> {
  const {output} = options

  const {
    close: closeWorkbenchServer,
    httpHost,
    workbenchAvailable,
    workbenchPort,
  } = await startWorkbenchDevServer(options)

  // Start app/studio dev server: use workbenchPort + 1 if workbench feature is
  // available (reserves the configured port for it), otherwise use the original port
  const desiredAppPort = workbenchAvailable ? workbenchPort + 1 : workbenchPort

  // When the workbench is running, point the remote's react-refresh preamble at
  // the workbench dev server so HMR updates flow through the host.
  const reactRefreshHost = workbenchAvailable
    ? `http://${httpHost || 'localhost'}:${workbenchPort}`
    : undefined

  const appOptions: DevActionOptions = {
    ...options,
    flags: {...options.flags, port: String(desiredAppPort)},
    reactRefreshHost,
    workbenchAvailable,
  }

  let closeAppDevServer: () => Promise<void> = noop
  let server
  try {
    const result = options.isApp
      ? await startAppDevServer(appOptions)
      : await startStudioDevServer(appOptions)
    closeAppDevServer = result.close ?? noop
    server = result.server
  } catch (err) {
    await closeWorkbenchServer()
    throw err
  }

  // server is undefined only when startAppDevServer exits early (e.g. missing orgId);
  // in that case the process is already exiting so no workbench needed.
  if (!server) {
    return {close: closeWorkbenchServer}
  }

  // Vite may have picked a different port if the desired one was occupied —
  // read the actual bound port from the http server address when available.
  const addr = server.httpServer?.address()
  const appPort = typeof addr === 'object' && addr ? addr.port : server.config.server.port

  // Register the studio/app dev server in the registry (federated projects only)
  let cleanupManifest: () => void = syncNoop
  let stopManifestWatcher: () => Promise<void> = noop
  let onSignal: (() => void) | undefined
  if (options.cliConfig?.federation?.enabled) {
    checkForDeprecatedAppId({cliConfig: options.cliConfig, output})

    // Read the applied host from the Vite dev server's resolved config —
    // this reflects any user-supplied Vite config that may have overridden
    // our defaults. `server.host` is `string | boolean | undefined`; non-string
    // values (true/false/undefined → 0.0.0.0/localhost) aren't useful as a
    // URL host, so fall back to 'localhost'.
    const resolvedHost = server.config.server.host
    const appHost = typeof resolvedHost === 'string' ? resolvedHost : 'localhost'

    // Extract the initial manifest once at startup so the registry entry
    // already carries the workbench-facing payload. For studios, the
    // watcher below keeps it in sync with subsequent `sanity.config.ts`
    // changes; coreApps have no schema to track, so no watcher is needed.
    let initialManifest: CoreAppManifest | StudioManifest | undefined
    try {
      initialManifest = options.isApp
        ? await extractCoreAppManifest({workDir: options.workDir})
        : await extractStudioManifest({workDir: options.workDir})
    } catch (err) {
      output.warn(
        `Could not extract manifest for workbench: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const registration = registerDevServer({
      host: appHost,
      id: getAppId(options.cliConfig),
      manifest: initialManifest,
      manifestUpdatedAt: initialManifest ? new Date().toISOString() : undefined,
      port: appPort,
      type: options.isApp ? 'coreApp' : 'studio',
      workDir: options.workDir,
    })
    cleanupManifest = registration.release

    // For studios, run the schema extraction worker and keep the generated
    // `create-manifest.json` in sync with `sanity.config.ts` changes. Each
    // successful extraction inlines the manifest into the registry entry
    // and triggers a workbench rebroadcast to connected clients.
    if (!options.isApp) {
      const watcher = await startDevManifestWatcher({
        output,
        update: registration.update,
        workDir: options.workDir,
      })
      stopManifestWatcher = watcher.close
    }

    // Ensure manifest and workbench lock are cleaned up on abrupt shutdown.
    // closeWorkbenchServer() starts with synchronous calls (watcher.close,
    // lock.release) that complete before the process exits; the trailing
    // async server.close() is best-effort.
    onSignal = () => {
      cleanupManifest()
      closeWorkbenchServer()
      process.off('SIGINT', onSignal!)
      process.off('SIGTERM', onSignal!)
    }
    process.on('SIGINT', onSignal)
    process.on('SIGTERM', onSignal)
  }

  if (workbenchAvailable) {
    const workbenchUrl = `http://${httpHost || 'localhost'}:${workbenchPort}`
    output.log(
      `Workbench dev server started at ${styleText(['blue', 'underline'], workbenchUrl)} (app on port ${appPort})`,
    )
  }

  return {
    close: async () => {
      // Remove signal handlers to prevent double-cleanup and listener leaks
      if (onSignal) {
        process.off('SIGINT', onSignal)
        process.off('SIGTERM', onSignal)
      }
      cleanupManifest()
      // Run all closes independently — a failure in one must not prevent the
      // others from shutting down
      await Promise.allSettled([stopManifestWatcher(), closeWorkbenchServer(), closeAppDevServer()])
    },
  }
}
