import {SANITY_CACHE_DIR} from '@sanity/cli-build/_internal/build'
import {extractCoreAppManifest} from '@sanity/cli-build/_internal/manifest'
import {type CliConfig} from '@sanity/cli-core'
import {isWorkbenchApp, isWorkbenchConfig} from '@sanity/workbench-cli'
import {startWorkbenchDev, watchForWorkbenchOptIn} from '@sanity/workbench-cli/dev'

import {checkForDeprecatedAppId} from '../../util/appId.js'
import {determineIsApp} from '../../util/determineIsApp.js'
import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
import {resolveReactStrictMode} from '../../util/resolveReactStrictMode.js'
import {extractStudioManifest} from '../manifest/extractStudioManifest.js'
import {startAppDevServer} from './servers/startAppDevServer.js'
import {startStudioDevServer} from './servers/startStudioDevServer.js'
import {type DevActionOptions} from './types.js'

const noop = async () => {}

/**
 * Entry point for `sanity dev`. A plain studio/app starts a single dev server, as
 * before workbench existed, and switches to the workbench if `sanity.cli.*` opts
 * in while it runs. A workbench app (via `defineApplication`) delegates to
 * `@sanity/workbench-cli`, injecting the CLI-domain pieces (app server, manifest
 * extraction, app id).
 */
export async function devAction(options: DevActionOptions): Promise<{close: () => Promise<void>}> {
  const {cliConfig, output, workDir} = options

  // A workbench app (an app to render) or a workbench config (config-only, like
  // the media library, which needs the workbench to render it) both delegate.
  if (isWorkbenchApp(cliConfig?.app) || isWorkbenchConfig(cliConfig?.app)) {
    return startWorkbench(options)
  }

  // Plain non-workbench studio/app: one dev server announcing its own URL.
  const {httpPort} = getServerConfig(options)
  const result = await startAppServer(options, {announceUrl: true, cliConfig, httpPort})
  if (!result.started) return {close: noop}

  return watchForWorkbenchOptIn({
    closePlainServer: result.close,
    output,
    startWorkbench: (freshConfig) =>
      startWorkbench({...options, cliConfig: freshConfig, isApp: determineIsApp(freshConfig)}),
    workDir,
  })
}

/** The app/studio server; `announceUrl` is false when the workbench announces the URL on its behalf. */
function startAppServer(
  options: DevActionOptions,
  params: {announceUrl: boolean; cliConfig: CliConfig; httpPort: number},
) {
  return (options.isApp ? startAppDevServer : startStudioDevServer)({...options, ...params})
}

function getServerConfig({cliConfig, flags, workDir}: DevActionOptions) {
  return getSharedServerConfig({cliConfig, flags: {host: flags.host, port: flags.port}, workDir})
}

function startWorkbench(options: DevActionOptions): Promise<{close: () => Promise<void>}> {
  const {cliConfig, isApp, output, workDir} = options
  const {httpHost, httpPort} = getServerConfig(options)

  return startWorkbenchDev({
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
    startAppServer: (params) => startAppServer(options, params),
    workDir,
  })
}
