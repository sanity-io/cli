import {styleText} from 'node:util'

import {normalizeAppId} from '../../util/appId.js'
import {readIconFromPath} from '../manifest/extractAppManifest.js'
import {registerDevServer} from './devServerRegistry.js'
import {startAppDevServer} from './startAppDevServer.js'
import {startStudioDevServer} from './startStudioDevServer.js'
import {startWorkbenchDevServer} from './startWorkbenchDevServer.js'
import {type DevActionOptions} from './types.js'

const noop = async () => {}
const syncNoop = () => {}

export async function devAction(options: DevActionOptions): Promise<{close: () => Promise<void>}> {
  const {output} = options

  if (options.cliConfig) {
    normalizeAppId({cliConfig: options.cliConfig, output})
  }

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

  // Register the studio/app dev server in the registry (federated projects only)
  let cleanupManifest: () => void = syncNoop
  let onSignal: (() => void) | undefined
  if (options.cliConfig?.federation?.enabled) {
    const addr = server.httpServer?.address()
    const appPort = typeof addr === 'object' && addr ? addr.port : server.config.server.port

    // Read the applied host from the Vite dev server's resolved config —
    // this reflects any user-supplied Vite config that may have overridden
    // our defaults. `server.host` is `string | boolean | undefined`; non-string
    // values (true/false/undefined → 0.0.0.0/localhost) aren't useful as a
    // URL host, so fall back to 'localhost'.
    const resolvedHost = server.config.server.host
    const appHost = typeof resolvedHost === 'string' ? resolvedHost : 'localhost'

    const iconPath = options.cliConfig?.app?.icon
    let icon: string | undefined
    if (iconPath) {
      try {
        icon = await readIconFromPath(options.workDir, iconPath)
      } catch (err) {
        output.warn(
          `Could not inline app icon for workbench discovery: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    cleanupManifest = registerDevServer({
      host: appHost,
      icon,
      id: options.cliConfig?.deployment?.appId,
      port: appPort,
      title: options.isApp ? options.cliConfig?.app?.title : undefined,
      type: options.isApp ? 'coreApp' : 'studio',
      workDir: options.workDir,
    })

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
    const addr = server.httpServer?.address()
    const appPort = typeof addr === 'object' && addr ? addr.port : server.config.server.port
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
      // Run both closes independently — a failing workbench close must not prevent
      // the primary server from shutting down
      await Promise.allSettled([closeWorkbenchServer(), closeAppDevServer()])
    },
  }
}
