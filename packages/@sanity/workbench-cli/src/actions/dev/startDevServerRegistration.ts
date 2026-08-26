import {type CliConfig, getCliConfigUncached, type Output} from '@sanity/cli-core'
import {type ViteDevServer} from 'vite'

import {applicationReference} from '../../applicationReference.js'
import {isWorkbenchApp, isWorkbenchConfig} from '../../defineApp.js'
import {deriveInterfaces} from '../../deriveInterfaces.js'
import {resolveWorkbenchConfig} from '../../resolveWorkbenchConfig.js'
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
 * Log any app validation errors without aborting. Unlike build and deploy, dev
 * stays up on an invalid app so the author sees the errors and fixes them live on
 * the next save. A config is not an app — it isn't validated by the app schema
 * (which would spuriously demand a slug/title), so skip it here.
 */
function reportConfigErrors(app: CliConfig['app'], output: Output): void {
  if (isWorkbenchConfig(app)) return
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

/**
 * Remedy line for a same-role slug conflict, phrased for the role. Changing the
 * slug is only real advice for an app — a config app's slug is fixed by the
 * app it configures (e.g. `unstable_defineMediaLibrary` hard-codes it).
 */
function conflictRemedy(configOnly: boolean): string {
  return configOnly
    ? 'Stop that server first.'
    : 'Stop that server, or give this app its own `slug` in sanity.cli.ts.'
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
  const configs = await deriveConfigs(cliConfig)

  const workbenchApp = isWorkbenchApp(cliConfig.app) ? cliConfig.app : undefined
  const config = resolveWorkbenchConfig(cliConfig)
  // A config keys on its target app type in its own namespace (`config:${appType}`),
  // never the app's slug — so a config server and the app it configures don't
  // collide on one id. An app still keys on its slug.
  const id = config ? `config:${config.appType}` : workbenchApp?.slug
  // Identity is resolved and the reference composed here, so the workbench reads
  // both off the registry entry instead of recomposing them. Name defaults to the
  // slug, mirroring brett.
  const name = workbenchApp?.name ?? workbenchApp?.slug
  const reference =
    workbenchApp && name
      ? // No workbench app is a singleton now that the only one (the Media Library)
        // is a config, not an app — so its reference is always `<org>/<name>`.
        applicationReference({
          isSingleton: false,
          name,
          organizationId: workbenchApp.organizationId,
        })
      : undefined

  const configOnly = isConfigOnlyServer({configs, interfaces})
  const devServer = id ? findSameRoleConflict(id, configOnly) : undefined

  if (id && devServer) {
    const subject = configOnly ? `A config for "${id}"` : `The app "${id}"`
    output.error(
      `${subject} is already served by another dev server running on port ${devServer.port}, ` +
        "so the workbench can't tell them apart and this one stays out of it. " +
        conflictRemedy(configOnly),
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
    name,
    port: appPort,
    projectId: cliConfig?.api?.projectId,
    reference,
    type: isApp ? 'coreApp' : 'studio',
    workDir,
  })

  const exposesSet = trackExposesSet({configs, interfaces})

  const watcher = await startDevManifestWatcher({
    // Re-derive every pass (don't omit): the registry patch is a shallow merge,
    // so omitting would wipe the registered set.
    extract: async (params) => {
      const nextConfig = await getCliConfigUncached(params.workDir)
      reportConfigErrors(nextConfig.app, output)
      return {
        configs: await deriveConfigs(nextConfig),
        interfaces: deriveInterfaces(nextConfig.app, {isApp}),
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
          const subject = nextConfigOnly ? `a config for "${id}"` : `the app "${id}"`
          output.error(
            `This change makes this dev server serve ${subject} like the dev server running on ` +
              `port ${conflict.port} already does, so the workbench couldn't tell them apart — ` +
              `keeping the previous registration. ${conflictRemedy(nextConfigOnly)}`,
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
