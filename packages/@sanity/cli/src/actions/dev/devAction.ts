import {styleText} from 'node:util'

import {getCliConfigUncached, isWorkbenchApp} from '@sanity/cli-core'

import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
import {startDevServerRegistration} from './registration/startDevServerRegistration.js'
import {startAppDevServer} from './servers/startAppDevServer.js'
import {startStudioDevServer} from './servers/startStudioDevServer.js'
import {type DevActionOptions, type StartDevServerResult} from './types.js'
import {startWorkbenchDevServer} from './workbench/startWorkbenchDevServer.js'

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
    workbenchAvailable,
  }

  let closeAppDevServer: () => Promise<void> = noop

  // (Re)start the app/studio dev server, tracking its close handle.
  // Takes the config so a rebuild can feed a freshly-loaded one.
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
  // can't do it — it re-uses the inline config — so we tear the app server down
  // and bring it back up on the same port with a freshly-loaded config. The
  // workbench page then reloads (driven by the registry watch in the workbench
  // server) to re-fetch the rebuilt remote. A view/service *source* edit doesn't
  // change the interface set, so it stays on the HMR path untouched.
  // Studios declare no interfaces, so they get no rebuild hook.
  const onInterfaceSetChange = options.isApp
    ? async () => {
        const freshConfig = await getCliConfigUncached(workDir)
        await closeAppDevServer()
        await startApp(freshConfig)
      }
    : undefined

  // Workbench is opted into solely by calling `unstable_defineApp` — its
  // branded identity is the only signal.
  const registration = isWorkbenchApp(cliConfig?.app)
    ? await startDevServerRegistration({
        cliConfig,
        isApp: options.isApp,
        onInterfaceSetChange,
        output,
        server,
        workDir,
      })
    : undefined

  if (workbenchAvailable) {
    const workbenchUrl = `http://${workbenchHost || 'localhost'}:${workbenchPort}`
    const addr = server.httpServer?.address()
    const appPort = typeof addr === 'object' && addr ? addr.port : server.config.server.port
    output.log(
      `Workbench dev server started at ${styleText(['blue', 'underline'], workbenchUrl)} (app on port ${appPort})`,
    )
  }

  const close = async () => {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    await Promise.allSettled([registration?.close(), closeWorkbenchServer(), closeAppDevServer()])
  }

  // Ensure the workbench lock file and registry entries are cleaned up on
  // abrupt shutdown. The registry is self-healing (stale PIDs are pruned on
  // next read), but eager cleanup avoids the detect-prune-retry cycle.
  const onSignal = () => void close()
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  return {close}
}
