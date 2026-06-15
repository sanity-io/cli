import {styleText} from 'node:util'

import {getCliConfigUncached, isWorkbenchApp} from '@sanity/cli-core'

import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
import {startDevServerRegistration} from './registration/startDevServerRegistration.js'
import {startAppDevServer} from './servers/startAppDevServer.js'
import {startStudioDevServer} from './servers/startStudioDevServer.js'
import {type DevActionOptions, type StartDevServerResult} from './types.js'
import {startWorkbenchDevServer} from './workbench/startWorkbenchDevServer.js'

const noop = async () => {}

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

  const {
    close: closeWorkbenchServer,
    httpHost: workbenchHost,
    workbenchAvailable,
    workbenchPort,
  } = await startWorkbenchDevServer({...options, httpHost, httpPort})

  // A running workbench claims the configured port, so devAction hands the app
  // server the next one explicitly rather than rewriting the shared flags.
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
  // can't do it — it re-uses the inline config — so we tear the app server down
  // and bring it back up on the same port with a freshly-loaded config. The
  // workbench page then reloads (driven by the registry watch in the workbench
  // server) to re-fetch the rebuilt remote. A view/service *source* edit doesn't
  // change the interface set, so it stays on the HMR path untouched.
  // Studios declare views/services the same way (only `entry` is rejected,
  // FR-026), so they get the same rebuild — `startApp` routes to the right
  // server for both.
  const onInterfaceSetChange = async () => {
    const freshConfig = await getCliConfigUncached(workDir)
    await closeAppDevServer()
    await startApp(freshConfig)
  }

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
    const workbenchUrl = `http://${toDisplayHost(workbenchHost)}:${workbenchPort}`
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
  // Plain projects have no lock or registry entry, so they keep the default
  // signal handling (and exit codes) they had before workbench existed.
  const onSignal = () => void close()
  if (workbenchAvailable || registration) {
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)
  }

  return {close}
}
