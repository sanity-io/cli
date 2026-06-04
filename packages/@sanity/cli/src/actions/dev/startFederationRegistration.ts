import {type CliConfig, type Output} from '@sanity/cli-core'
import {isWorkbenchApp} from '@sanity/federation'
import {type ViteDevServer} from 'vite'

import {checkForDeprecatedAppId, getAppId} from '../../util/appId.js'
import {extractCoreAppManifest} from '../manifest/extractCoreAppManifest.js'
import {registerDevServer} from './devServerRegistry.js'
import {extractStudioManifest} from './extractDevServerManifest.js'
import {startDevManifestWatcher} from './startDevManifestWatcher.js'

interface FederationRegistrationOptions {
  cliConfig: CliConfig
  isApp: boolean
  output: Output
  server: ViteDevServer
  workDir: string
}

interface FederationRegistration {
  close: () => Promise<void>
}

/**
 * Registers the dev server in the dev server registry and starts a watcher for the manifest file. The registration
 * is used by the workbench to know where the dev server is running and to display it in the UI. The manifest watcher
 * is used to update the registration with the latest manifest, which the workbench uses to display project metadata.
 */
export async function startFederationRegistration(
  options: FederationRegistrationOptions,
): Promise<FederationRegistration> {
  const {cliConfig, isApp, output, server, workDir} = options

  checkForDeprecatedAppId({cliConfig, output})

  const resolvedHost = server.config.server.host
  const appHost = typeof resolvedHost === 'string' ? resolvedHost : 'localhost'

  const addr = server.httpServer?.address()
  const appPort = typeof addr === 'object' && addr ? addr.port : server.config.server.port

  // Interfaces live on the branded `unstable_defineApp` result as declared
  // `views` (panels), `services` (workers), and the app's navigable `entry`. A
  // service is just an interface discriminated by `interface_type`, so map them
  // into a single `interfaces` list and forward them on the registry entry
  // (alongside, not inside, the manifest) so the workbench can render local
  // panels, run local workers, and resolve the app view without a deploy.
  // `entry_point` is the declared `src` — the raw value, not a resolved URL.
  const app = isWorkbenchApp(cliConfig.app) ? cliConfig.app : undefined

  // US5 — studio app views are not implemented yet. A studio (not an SDK app)
  // that declares `entry` reaches the app-view path; reject with a clear error
  // rather than deriving an `app` interface for it. SDK app views are a later
  // iteration for studios (FR-026).
  if (app && !isApp && app.entry !== undefined) {
    throw new Error('App views for studios are not implemented yet')
  }

  const interfaces = app
    ? [
        ...(app.views?.map((view) => ({
          entry_point: view.src,
          interface_type: view.type,
          name: view.name,
        })) ?? []),
        ...(app.services?.map((service) => ({
          entry_point: service.src,
          interface_type: service.type,
          name: service.name,
        })) ?? []),
        // US5 — an SDK app's `entry` declares its navigable full-page `app`
        // view. Forward it as an `app` interface so the workbench knows the app
        // is navigable; with no `entry` the app has no `app` view and is not
        // reachable as a full-page app.
        ...(app.entry === undefined
          ? []
          : [
              {
                entry_point: app.entry,
                interface_type: 'app' as const,
                name: app.name,
              },
            ]),
      ]
    : undefined

  const registration = registerDevServer({
    host: appHost,
    id: getAppId(cliConfig),
    interfaces,
    port: appPort,
    projectId: cliConfig?.api?.projectId,
    type: isApp ? 'coreApp' : 'studio',
    workDir,
  })

  const watcher = await startDevManifestWatcher({
    extract: isApp
      ? ({workDir: wd}) => extractCoreAppManifest({workDir: wd})
      : extractStudioManifest,
    output,
    update: registration.update,
    workDir,
  })

  return {
    close: async () => {
      registration.release()
      await watcher.close()
    },
  }
}
