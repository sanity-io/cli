import {styleText} from 'node:util'

import {registerDevServer} from './devServerRegistry.js'
import {startAppDevServer} from './startAppDevServer.js'
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

  // Register the studio/app dev server in the registry (federated projects only)
  let cleanupManifest: () => void = syncNoop
  if (options.cliConfig?.federation?.enabled) {
    const addr = server.httpServer?.address()
    const appPort = typeof addr === 'object' && addr ? addr.port : server.config.server.port
    cleanupManifest = registerDevServer({
      host: httpHost || 'localhost',
      port: appPort,
      type: options.isApp ? 'app' : 'studio',
      workDir: options.workDir,
    })

    // Ensure manifest is cleaned up on abrupt shutdown
    const onSignal = () => {
      cleanupManifest()
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
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
      cleanupManifest()
      // Run both closes independently — a failing workbench close must not prevent
      // the primary server from shutting down
      await Promise.allSettled([closeWorkbenchServer(), closeAppDevServer()])
    },
  }
}
