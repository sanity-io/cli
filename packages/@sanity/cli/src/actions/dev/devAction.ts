import {SANITY_CACHE_DIR} from '@sanity/cli-build/_internal/build'
import {type CliConfig} from '@sanity/cli-core'
import {isWorkbenchApp} from '@sanity/workbench-cli'

import {checkForDeprecatedAppId, getAppId} from '../../util/appId.js'
import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
import {resolveReactStrictMode} from '../../util/resolveReactStrictMode.js'
import {extractCoreAppManifest} from '../manifest/extractCoreAppManifest.js'
import {extractStudioManifest} from '../manifest/extractStudioManifest.js'
import {startAppDevServer} from './servers/startAppDevServer.js'
import {startStudioDevServer} from './servers/startStudioDevServer.js'
import {type DevActionOptions} from './types.js'

const noop = async () => {}

/**
 * Entry point for `sanity dev`. A plain studio/app starts a single dev server, as
 * before workbench existed. A workbench app (via `unstable_defineApp`) delegates to
 * `@sanity/workbench-cli`, injecting the CLI-domain pieces (app server, manifest
 * extraction, app id) and loading the package lazily so plain projects never do.
 */
export async function devAction(options: DevActionOptions): Promise<{close: () => Promise<void>}> {
  const {cliConfig, flags, isApp, output, workDir} = options

  const {httpHost, httpPort} = getSharedServerConfig({
    cliConfig,
    flags: {host: flags.host, port: flags.port},
    workDir,
  })

  // The app/studio server, parameterized per call; `announceUrl` is false when
  // the workbench announces the URL on its behalf.
  const startAppServer = (params: {announceUrl: boolean; cliConfig: CliConfig; httpPort: number}) =>
    (isApp ? startAppDevServer : startStudioDevServer)({
      ...options,
      announceUrl: params.announceUrl,
      cliConfig: params.cliConfig,
      httpPort: params.httpPort,
    })

  if (isWorkbenchApp(cliConfig?.app)) {
    // Lazy so a non-workbench `sanity dev` never loads the package. `doImport`
    // is path-based and doesn't apply to a bare specifier.
    // eslint-disable-next-line no-restricted-syntax
    const {startWorkbenchDev} = await import('@sanity/workbench-cli/dev')
    return startWorkbenchDev({
      appId: getAppId(cliConfig),
      cacheDir: `${SANITY_CACHE_DIR}/vite`,
      checkForDeprecatedAppId: () => checkForDeprecatedAppId({cliConfig, output}),
      cliConfig,
      extractManifest: isApp
        ? ({workDir: wd}) => extractCoreAppManifest({workDir: wd})
        : (params) => extractStudioManifest(params),
      httpHost,
      httpPort,
      isApp,
      output,
      // Runtime template needs a concrete boolean; collapse an unset config to off.
      reactStrictMode: resolveReactStrictMode(cliConfig) ?? false,
      startAppServer,
      workDir,
    })
  }

  // Plain non-workbench studio/app: one dev server announcing its own URL.
  const result = await startAppServer({announceUrl: true, cliConfig, httpPort})
  return {close: result.started ? result.close : noop}
}
