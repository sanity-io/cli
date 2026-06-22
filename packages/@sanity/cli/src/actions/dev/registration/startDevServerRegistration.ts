import {type CliConfig, getCliConfigUncached, type Output} from '@sanity/cli-core'
import {deriveInterfaces, registerDevServer, trackInterfaceSet} from '@sanity/workbench-cli/dev'
import {type ViteDevServer} from 'vite'

import {checkForDeprecatedAppId, getAppId} from '../../../util/appId.js'
import {extractCoreAppManifest} from '../../manifest/extractCoreAppManifest.js'
import {extractStudioManifest} from './extractDevServerManifest.js'
import {startDevManifestWatcher} from './startDevManifestWatcher.js'

interface DevServerRegistrationOptions {
  cliConfig: CliConfig
  isApp: boolean
  output: Output
  server: ViteDevServer
  workDir: string

  /**
   * Called when the declared interface *set* changes (a view/service added,
   * removed, renamed, or repointed in `sanity.cli.ts`), awaited *before* the
   * registry is patched — the registry patch is what reloads the workbench
   * page, and it must re-fetch a remote that already exposes the new
   * interface, so the caller's rebuild has to complete first. A view/service
   * *source* edit doesn't change the set and never fires this. Studios
   * declare views/services the same way apps do, so both pass a rebuild.
   *
   * Resolves with the recreated dev server so the registry entry can be
   * patched with its actual address — workbench projects run with non-strict
   * ports, so the replacement isn't guaranteed to bind the port registered at
   * startup. Must reject when the restart doesn't produce a listening server:
   * the set id stays uncommitted so the next config save retries the rebuild
   * instead of advertising the new interface set on a dead port.
   */
  onInterfaceSetChange?: () => Promise<ViteDevServer>
}

interface DevServerRegistrationHandle {
  close: () => Promise<void>
}

/**
 * The address a dev server actually bound, preferring the live socket over the
 * configured port — with non-strict ports the two can disagree. Used for the
 * initial registration and again after an interface-set rebuild recreates the
 * server, so the registry never advertises a port nothing listens on.
 */
function serverAddress(server: ViteDevServer) {
  const resolvedHost = server.config.server.host
  const addr = server.httpServer?.address()
  return {
    host: typeof resolvedHost === 'string' ? resolvedHost : 'localhost',
    port: typeof addr === 'object' && addr ? addr.port : server.config.server.port,
  }
}

/**
 * Register the dev server in the dev server registry and start a watcher for
 * the manifest file. The workbench reads the registration to locate the dev
 * server and display it in the UI; the manifest watcher keeps that registration
 * pointed at the latest manifest, which the workbench renders as project metadata.
 */
export async function startDevServerRegistration(
  options: DevServerRegistrationOptions,
): Promise<DevServerRegistrationHandle> {
  const {cliConfig, isApp, onInterfaceSetChange, output, server, workDir} = options

  checkForDeprecatedAppId({cliConfig, output})

  const {host: appHost, port: appPort} = serverAddress(server)

  // Interfaces (panels/workers/app view) are derived from the branded
  // `unstable_defineApp` config and forwarded on the registry entry (alongside,
  // not inside, the manifest) so the workbench renders local panels, runs local
  // workers, and resolves the app view without a deploy. The watcher below
  // re-derives them on every `sanity.cli.ts` edit so adding/removing a view or
  // service re-syncs live (FR-024) — the way `title`/`icon` already do.
  const interfaces = deriveInterfaces(cliConfig.app, {isApp})

  const registration = registerDevServer({
    host: appHost,
    id: getAppId(cliConfig),
    interfaces,
    port: appPort,
    projectId: cliConfig?.api?.projectId,
    type: isApp ? 'coreApp' : 'studio',
    workDir,
  })

  // Tracks whether a watcher pass changed the *set* of interfaces (rebuild
  // needed) vs. only the manifest (title/icon) or a view/service source file
  // (HMR handles it — the set is unchanged). Committed separately from the
  // detection so a failed rebuild stays eligible for retry (see below).
  const interfaceSet = trackInterfaceSet(interfaces)

  const watcher = await startDevManifestWatcher({
    extract: isApp
      ? async ({workDir: wd}) => ({
          // Interfaces are NOT part of the manifest — they're re-derived from the
          // same config edit and forwarded as a separate registry field, so a
          // `views`/`services`/`entry` change re-syncs live (FR-024).
          interfaces: deriveInterfaces((await getCliConfigUncached(wd)).app, {isApp}),
          manifest: await extractCoreAppManifest({workDir: wd}),
        })
      : async (params) => ({
          // Studios declare views/services in `sanity.cli.ts` too — re-derive
          // them like the app extract does. The registry patch is a shallow
          // merge, so a hardcoded `interfaces: undefined` here would wipe the
          // panels/workers forwarded by the initial registration on the very
          // first regeneration.
          interfaces: deriveInterfaces((await getCliConfigUncached(params.workDir)).app, {isApp}),
          manifest: await extractStudioManifest(params),
        }),
    // A studio's project root resolves to `sanity.config.*`, but its workbench
    // interfaces live in `sanity.cli.*` — watch that too so adding/removing a
    // view or service regenerates without a manual restart. Apps already
    // resolve their root to `sanity.cli.*`.
    extraWatchFilenames: isApp ? undefined : ['sanity.cli.js', 'sanity.cli.ts'],
    output,
    update: async (patch) => {
      if (!interfaceSet.changed(patch.interfaces)) {
        // Set unchanged (reorder, or a manifest-only/source-file edit) — patch
        // the registry and let HMR handle the rest; no rebuild needed.
        registration.update(patch)
        return
      }
      // Rebuild the app remote first (so the new view/service has an expose +
      // artifact), THEN patch the registry — the registry patch is what reloads
      // the workbench page, and it must re-fetch a remote that already exposes
      // the new interface.
      const rebuiltServer = await onInterfaceSetChange?.()
      // Commit only after the rebuild resolves: a thrown rebuild surfaces
      // through the watcher's failure path with the set uncommitted, so the
      // next pass over the same declarations retries instead of skipping.
      interfaceSet.commit(patch.interfaces)
      // The recreated server can bind a different port (non-strict ports), so
      // the patch carries its actual address alongside the manifest fields.
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
