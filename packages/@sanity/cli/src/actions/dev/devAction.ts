import {styleText} from 'node:util'

import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
import {startAppDevServer} from './startAppDevServer.js'
import {startFederationRegistration} from './startFederationRegistration.js'
import {startStudioDevServer} from './startStudioDevServer.js'
import {startWorkbenchDevServer} from './startWorkbenchDevServer.js'
import {type DevActionOptions} from './types.js'

const noop = async () => {}

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

  const {
    close: closeWorkbenchServer,
    httpHost: workbenchHost,
    workbenchAvailable,
    workbenchPort,
  } = await startWorkbenchDevServer({...options, httpHost, httpPort})

  // Use workbenchPort + 1 when workbench claims the configured port
  const desiredAppPort = workbenchAvailable ? workbenchPort + 1 : workbenchPort

  const appOptions: DevActionOptions = {
    ...options,
    flags: {...options.flags, port: String(desiredAppPort)},
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

  if (!server) {
    return {close: closeWorkbenchServer}
  }

  const closeFederation = cliConfig?.federation?.enabled
    ? await startFederationRegistration({
        cliConfig,
        isApp: options.isApp,
        output,
        server,
        workDir,
      })
    : undefined

  const addr = server.httpServer?.address()
  const appPort = typeof addr === 'object' && addr ? addr.port : server.config.server.port

  if (workbenchAvailable) {
    const workbenchUrl = `http://${workbenchHost || 'localhost'}:${workbenchPort}`
    output.log(
      `Workbench dev server started at ${styleText(['blue', 'underline'], workbenchUrl)} (app on port ${appPort})`,
    )
  } else {
    const appUrl = `http://${httpHost || 'localhost'}:${appPort}`
    const label = options.isApp ? 'App' : 'Studio'
    output.log(`${label} dev server started at ${styleText(['blue', 'underline'], appUrl)}`)
  }

  const close = async () => {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    await Promise.allSettled([
      closeFederation?.close(),
      closeWorkbenchServer(),
      closeAppDevServer(),
    ])
  }

  // Ensure the workbench lock file and registry entries are cleaned up on
  // abrupt shutdown. The registry is self-healing (stale PIDs are pruned on
  // next read), but eager cleanup avoids the detect-prune-retry cycle.
  const onSignal = () => void close()
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  return {close}
}
