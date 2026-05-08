import {type CliConfig, type Output} from '@sanity/cli-core'
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

  const registration = registerDevServer({
    host: appHost,
    id: getAppId(cliConfig),
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
