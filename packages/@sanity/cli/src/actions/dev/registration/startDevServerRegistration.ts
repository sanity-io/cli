import {type CliConfig, getCliConfigUncached, type Output} from '@sanity/cli-core'
import {type ViteDevServer} from 'vite'

import {checkForDeprecatedAppId, getAppId} from '../../../util/appId.js'
import {extractCoreAppManifest} from '../../manifest/extractCoreAppManifest.js'
import {registerDevServer} from '../registry/index.js'
import {deriveInterfaces} from './deriveInterfaces.js'
import {extractStudioManifest} from './extractDevServerManifest.js'
import {interfaceSetId} from './interfaceSetId.js'
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
   * *source* edit doesn't change the set and never fires this. Studios declare
   * no interfaces, so they pass nothing.
   */
  onInterfaceSetChange?: () => Promise<void>
}

interface DevServerRegistrationHandle {
  close: () => Promise<void>
}

/**
 * Registers the dev server in the dev server registry and starts a watcher for the manifest file. The registration
 * is used by the workbench to know where the dev server is running and to display it in the UI. The manifest watcher
 * is used to update the registration with the latest manifest, which the workbench uses to display project metadata.
 */
export async function startDevServerRegistration(
  options: DevServerRegistrationOptions,
): Promise<DevServerRegistrationHandle> {
  const {cliConfig, isApp, onInterfaceSetChange, output, server, workDir} = options

  checkForDeprecatedAppId({cliConfig, output})

  const resolvedHost = server.config.server.host
  const appHost = typeof resolvedHost === 'string' ? resolvedHost : 'localhost'

  const addr = server.httpServer?.address()
  const appPort = typeof addr === 'object' && addr ? addr.port : server.config.server.port

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

  // Track the registered set so a watcher pass can tell whether the *set* of
  // interfaces changed (rebuild needed) vs. only the manifest (title/icon) or a
  // view/service source file (HMR handles it — the set is unchanged).
  let lastInterfaceSetId = interfaceSetId(interfaces)

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
    output,
    update: async (patch) => {
      const nextInterfaceSetId = interfaceSetId(patch.interfaces)
      if (nextInterfaceSetId !== lastInterfaceSetId) {
        lastInterfaceSetId = nextInterfaceSetId
        // Rebuild the app remote first (so the new view/service has an expose +
        // artifact), THEN patch the registry — the registry patch is what reloads
        // the workbench page, and it must re-fetch a remote that already exposes
        // the new interface.
        await onInterfaceSetChange?.()
      }
      registration.update(patch)
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
