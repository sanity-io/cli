import {type CliConfig, getCliConfigUncached, type Output} from '@sanity/cli-core'
import {type ViteDevServer} from 'vite'

import {isWorkbenchApp, isWorkbenchConfig} from '../../defineApp.js'
import {deriveInterfaces} from '../../deriveInterfaces.js'
import {resolveWorkbenchConfig} from '../../resolveWorkbenchConfig.js'
import {formatWorkbenchAppErrors, validateWorkbenchApp} from '../../validateWorkbenchApp.js'
import {deriveConfigs} from './deriveConfigs.js'
import {trackExposesSet} from './exposesSetId.js'
import {
  dashboardPath,
  type DevServerManifest,
  getRegisteredServers,
  localAppIdentity,
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
    applicationId?: string
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

  /** Where the Dashboard opens this server; unset when it can't open it there. */
  path?: string
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
  // A config runs alongside the app it configures, so give it its own id
  // namespace — sharing the app's id would make the two indistinguishable here.
  const id = config ? `config:${config.appType}` : cliConfig.deployment?.appId
  const identity = workbenchApp ? localAppIdentity(workbenchApp) : undefined
  const slug = identity?.slug
  const type = isApp ? 'coreApp' : 'studio'

  // The Dashboard keys a local app on its id, or on its slug and route without one.
  const organizationId = cliConfig.app?.organizationId
  const devServer = getRegisteredServers().find(
    (server) =>
      server.organizationId === organizationId &&
      ((id && server.id === id) || (slug && server.slug === slug && server.type === type)),
  )

  if (devServer) {
    output.error(
      `"${id && devServer.id === id ? id : slug}" is already served by another dev server running on port ${devServer.port}, ` +
        "so the Dashboard can't tell them apart and this one stays out of it. Stop that server first.",
      {exit: false},
    )
    return {close: async () => {}}
  }

  const registration = registerDevServer({
    configs,
    host: appHost,
    id,
    interfaces,
    organizationId,
    port: appPort,
    projectId: cliConfig?.api?.projectId,
    ...identity,
    type,
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
        manifest: await extractManifest({...params, applicationId: id ?? slug}),
      }
    },
    // A studio's root resolves to `sanity.config.*` but its interfaces live in
    // `sanity.cli.*` — watch that too. Apps already root at `sanity.cli.*`.
    extraWatchFilenames: isApp ? undefined : ['sanity.cli.js', 'sanity.cli.ts'],
    output,
    update: async (patch) => {
      if (
        !exposesSet.changed({
          configs: patch.configs,
          interfaces: patch.interfaces,
        })
      ) {
        registration.update(patch)
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
    },
    workDir,
  })

  return {
    close: async () => {
      registration.release()
      await watcher.close()
    },
    path: dashboardPath({interfaces, slug, type}),
  }
}
