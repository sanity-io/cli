import {type CliConfig, getCliConfigUncached, type Output} from '@sanity/cli-core'
import {type ViteDevServer} from 'vite'

import {isWorkbenchApp} from '../../defineApp.js'
import {deriveInterfaces} from '../../deriveInterfaces.js'
import {formatWorkbenchAppErrors, validateWorkbenchApp} from '../../validateWorkbenchApp.js'
import {deriveConfigs} from './deriveConfigs.js'
import {trackExposesSet} from './exposesSetId.js'
import {
  type DevServerManifest,
  getRegisteredServers,
  isConfigOnlyServer,
  registerDevServer,
} from './registry.js'
import {startDevManifestWatcher} from './startDevManifestWatcher.js'

interface DevServerRegistrationOptions {
  cliConfig: CliConfig
  /**
   * Extract the project manifest to inline into the registry. The caller owns the
   * studio-vs-app split (manifest formats are CLI-domain); registration re-derives
   * the interface set alongside it.
   */
  extractManifest: (params: {
    configPath: string
    workDir: string
  }) => Promise<DevServerManifest['manifest']>
  isApp: boolean
  output: Output
  server: ViteDevServer
  workDir: string

  /**
   * Rebuild the app's federation remote when its interface set changes, awaited
   * *before* the registry patch — the patch reloads the workbench page, which must
   * re-fetch a remote that already exposes the new interface. Resolves with the
   * recreated server so the entry gets its actual address (non-strict ports may
   * shift it); must reject if the restart produces no server, so the set stays
   * uncommitted and the next save retries instead of advertising a dead port.
   */
  onInterfaceSetChange?: () => Promise<ViteDevServer>
}

interface DevServerRegistrationHandle {
  close: () => Promise<void>
}

/**
 * Log any config validation errors without aborting. Unlike build and deploy,
 * dev stays up on an invalid config so the author sees the errors and fixes them
 * live on the next save.
 */
function reportConfigErrors(app: CliConfig['app'], output: Output): void {
  const errors = validateWorkbenchApp(app)
  if (errors.length === 0) return
  output.warn(formatWorkbenchAppErrors(errors))
}

/**
 * A live server — other than this process — already playing the given role for
 * the slug. Only a *same-role* duplicate is a conflict: a config-only server
 * (configs, no interfaces — e.g. a media-library config app) is never routed
 * as an app, so it may share a slug with the app server it configures. The
 * workbench renders the app and publishes both servers' configs, and can
 * always tell them apart.
 */
function findSameRoleConflict(id: string, configOnly: boolean): DevServerManifest | undefined {
  return getRegisteredServers().find(
    (server) =>
      server.pid !== process.pid && server.id === id && isConfigOnlyServer(server) === configOnly,
  )
}

/** The address the server actually bound — the live socket, which can differ from the configured port under non-strict ports. */
function serverAddress(server: ViteDevServer) {
  const resolvedHost = server.config.server.host
  const addr = server.httpServer?.address()
  return {
    host: typeof resolvedHost === 'string' ? resolvedHost : 'localhost',
    port: typeof addr === 'object' && addr ? addr.port : server.config.server.port,
  }
}

/**
 * Register the dev server in the registry and watch its config for manifest +
 * interface changes. The workbench reads the entry to locate and render the
 * server; the watcher keeps it current as `sanity.cli.ts` is edited.
 */
export async function startDevServerRegistration(
  options: DevServerRegistrationOptions,
): Promise<DevServerRegistrationHandle> {
  const {cliConfig, extractManifest, isApp, onInterfaceSetChange, output, server, workDir} = options

  const {host: appHost, port: appPort} = serverAddress(server)

  reportConfigErrors(cliConfig.app, output)

  // Forwarded alongside (not inside) the manifest so the workbench renders local
  // panels/workers and reads the configs without a deploy.
  const interfaces = deriveInterfaces(cliConfig.app, {isApp})
  const configs = await deriveConfigs(cliConfig.app)

  const id = isWorkbenchApp(cliConfig.app) ? cliConfig.app.slug : undefined

  const configOnly = isConfigOnlyServer({configs, interfaces})
  const devServer = id ? findSameRoleConflict(id, configOnly) : undefined

  if (id && devServer) {
    output.error(
      `The app "${id}" is already served by another dev server running on port ${devServer.port}, ` +
        "so the workbench can't tell them apart and this one stays out of it. " +
        'Stop that server, or give this app its own `slug` in sanity.cli.ts.',
      {exit: false},
    )
    return {close: async () => {}}
  }

  // The role the registry currently advertises for this server; a config edit
  // can flip it (see the re-check in `update`). Committed only after a
  // successful registry patch, so a failed pass re-checks on the next save.
  let registeredConfigOnly = configOnly

  const registration = registerDevServer({
    configs,
    host: appHost,
    id,
    interfaces,
    port: appPort,
    projectId: cliConfig?.api?.projectId,
    type: isApp ? 'coreApp' : 'studio',
    workDir,
  })

  const exposesSet = trackExposesSet({configs, interfaces})

  const watcher = await startDevManifestWatcher({
    // Re-derive every pass (don't omit): the registry patch is a shallow merge,
    // so omitting would wipe the registered set.
    extract: async (params) => {
      const app = (await getCliConfigUncached(params.workDir)).app
      reportConfigErrors(app, output)
      return {
        configs: await deriveConfigs(app),
        interfaces: deriveInterfaces(app, {isApp}),
        manifest: await extractManifest(params),
      }
    },
    // A studio's root resolves to `sanity.config.*` but its interfaces live in
    // `sanity.cli.*` — watch that too. Apps already root at `sanity.cli.*`.
    extraWatchFilenames: isApp ? undefined : ['sanity.cli.js', 'sanity.cli.ts'],
    output,
    update: async (patch) => {
      // A save can flip the server's role — e.g. a config-only app gaining an
      // `entry` becomes app-role — so re-run the same-role collision check the
      // registration gate applied, or the flip would quietly reintroduce the
      // ambiguity (two app-role servers on one slug). The patch is skipped, not
      // fatal: the registry keeps the previous shape and the next save retries.
      const nextConfigOnly = isConfigOnlyServer({
        configs: patch.configs,
        interfaces: patch.interfaces,
      })
      if (id && nextConfigOnly !== registeredConfigOnly) {
        const conflict = findSameRoleConflict(id, nextConfigOnly)
        if (conflict) {
          output.error(
            `This change makes the app "${id}" play the same role as the dev server running on ` +
              `port ${conflict.port}, so the workbench couldn't tell them apart — keeping the ` +
              'previous registration. Stop that server, or give this app its own `slug` in sanity.cli.ts.',
            {exit: false},
          )
          return
        }
      }

      if (
        !exposesSet.changed({
          configs: patch.configs,
          interfaces: patch.interfaces,
        })
      ) {
        registration.update(patch)
        registeredConfigOnly = nextConfigOnly
        return
      }
      // Rebuild the remote *before* patching the registry — the patch reloads the
      // page, which must re-fetch a remote that already exposes the new interface.
      const rebuiltServer = await onInterfaceSetChange?.()
      // Commit only after a successful rebuild, so a thrown one retries next pass.
      exposesSet.commit({
        configs: patch.configs,
        interfaces: patch.interfaces,
      })
      // The recreated server can bind a different port (non-strict ports).
      registration.update(rebuiltServer ? {...patch, ...serverAddress(rebuiltServer)} : patch)
      registeredConfigOnly = nextConfigOnly
    },
    workDir,
  })

  return {
    close: async () => {
      registration.release()
      await watcher.close()
    },
  }
}
