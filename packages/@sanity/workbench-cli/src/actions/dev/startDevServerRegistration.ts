import {getCliConfigUncached} from '@sanity/cli-core/config'
import {type CliConfig, type Output} from '@sanity/cli-core/types'
import {type ViteDevServer} from 'vite'

import {deriveInstallationConfigs, deriveInterfaces} from './deriveInterfaces.js'
import {trackExposesSet} from './exposesSetId.js'
import {type DevServerManifest, registerDevServer} from './registry.js'
import {startDevManifestWatcher} from './startDevManifestWatcher.js'

interface DevServerRegistrationOptions {
  /** Resolved app id for the registry entry; the caller owns id resolution and the deprecation check. */
  appId: string | undefined
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
  const {appId, cliConfig, extractManifest, isApp, onInterfaceSetChange, output, server, workDir} =
    options

  const {host: appHost, port: appPort} = serverAddress(server)

  // Forwarded alongside (not inside) the manifest so the workbench renders local
  // panels/workers and reads the configs without a deploy.
  const interfaces = deriveInterfaces(cliConfig.app, {isApp})
  const installationConfigs = deriveInstallationConfigs(cliConfig.app)

  const registration = registerDevServer({
    host: appHost,
    id: appId,
    installationConfigs,
    interfaces,
    port: appPort,
    projectId: cliConfig?.api?.projectId,
    type: isApp ? 'coreApp' : 'studio',
    workDir,
  })

  const exposesSet = trackExposesSet({installationConfigs, interfaces})

  const watcher = await startDevManifestWatcher({
    // Re-derive every pass (don't omit): the registry patch is a shallow merge,
    // so omitting would wipe the registered set.
    extract: async (params) => {
      const app = (await getCliConfigUncached(params.workDir)).app
      return {
        installationConfigs: deriveInstallationConfigs(app),
        interfaces: deriveInterfaces(app, {isApp}),
        manifest: await extractManifest(params),
      }
    },
    // A studio's root resolves to `sanity.config.*` but its interfaces live in
    // `sanity.cli.*` — watch that too. Apps already root at `sanity.cli.*`.
    extraWatchFilenames: isApp ? undefined : ['sanity.cli.js', 'sanity.cli.ts'],
    output,
    update: async (patch) => {
      if (
        !exposesSet.changed({
          installationConfigs: patch.installationConfigs,
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
        installationConfigs: patch.installationConfigs,
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
  }
}
