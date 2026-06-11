import {styleText} from 'node:util'

import {getCliConfigUncached, isWorkbenchApp} from '@sanity/cli-core'
import {type ViteDevServer} from 'vite'

import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
import {startFederationRegistration} from './registration/startFederationRegistration.js'
import {startAppDevServer} from './servers/startAppDevServer.js'
import {startStudioDevServer} from './servers/startStudioDevServer.js'
import {type DevActionOptions} from './types.js'
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
  let server: ViteDevServer | undefined

  // (Re)start the app/studio dev server, tracking its close handle + server ref.
  // Takes the config so a rebuild can feed a freshly-loaded one.
  const startApp = async (config: DevActionOptions['cliConfig']) => {
    const result = options.isApp
      ? await startAppDevServer({...appOptions, cliConfig: config})
      : await startStudioDevServer({...appOptions, cliConfig: config})
    closeAppDevServer = result.close ?? noop
    server = result.server
    return result.server
  }

  try {
    await startApp(cliConfig)
  } catch (err) {
    await closeWorkbenchServer()
    throw err
  }

  if (!server) {
    return {close: closeWorkbenchServer}
  }

  // Adding/removing a view or service in `sanity.cli.ts` during dev requires
  // rebuilding the federation remote: its module-federation `exposes` map +
  // codegen artifacts are computed once at server start, so a newly-declared
  // interface has no expose until the server is recreated. `server.restart()`
  // can't do it — it re-uses the inline config — so we tear the app server down
  // and bring it back up on the same port with a freshly-loaded config. The
  // workbench page then reloads (driven by the registry watch in the workbench
  // server) to re-fetch the rebuilt remote. A view/service *source* edit doesn't
  // change the interface set, so it stays on the HMR path untouched.
  const onInterfacesChange = options.isApp
    ? async () => {
        const freshConfig = await getCliConfigUncached(workDir)
        await closeAppDevServer()
        await startApp(freshConfig)
      }
    : undefined

  // Workbench is opted into solely by calling `unstable_defineApp` — its
  // branded identity is the only signal.
  const closeFederation = isWorkbenchApp(cliConfig?.app)
    ? await startFederationRegistration({
        cliConfig,
        isApp: options.isApp,
        onInterfacesChange,
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
