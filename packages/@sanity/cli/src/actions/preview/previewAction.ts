import {SANITY_CACHE_DIR} from '@sanity/cli-build/_internal/build'
import {type CliConfig, type Output} from '@sanity/cli-core'
import {isWorkbenchApp} from '@sanity/workbench-cli'

import {gracefulServerDeath} from '../../server/gracefulServerDeath.js'
import {type PreviewServer, startPreviewServer} from '../../server/previewServer.js'
import {checkForDeprecatedAppId} from '../../util/appId.js'
import {determineIsApp} from '../../util/determineIsApp.js'
import {resolveReactStrictMode} from '../../util/resolveReactStrictMode.js'
import {extractCoreAppManifest} from '../manifest/extractCoreAppManifest.js'
import {extractStudioManifest} from '../manifest/extractStudioManifest.js'
import {getPreviewServerConfig} from './getPreviewServerConfig.js'
import {type PreviewFlags} from './types.js'

interface PreviewActionOptions {
  cliConfig: CliConfig
  flags: PreviewFlags
  outDir: string
  output: Output
  workDir: string
}

export async function previewAction(
  options: PreviewActionOptions,
): Promise<PreviewServer | {close: () => Promise<void>}> {
  const {cliConfig, flags, outDir, output, workDir} = options

  const config = getPreviewServerConfig({cliConfig, flags, rootDir: outDir, workDir})

  if (isWorkbenchApp(cliConfig?.app)) {
    const isApp = determineIsApp(cliConfig)
    // Lazy so a non-workbench `sanity start` never loads the package. `doImport`
    // is path-based and doesn't apply to a bare specifier.
    // eslint-disable-next-line no-restricted-syntax
    const {startWorkbenchPreview} = await import('@sanity/workbench-cli/preview')
    return startWorkbenchPreview({
      cacheDir: `${SANITY_CACHE_DIR}/vite`,
      checkForDeprecatedAppId: () => checkForDeprecatedAppId({cliConfig, output}),
      cliConfig,
      extractManifest: isApp
        ? ({workDir: wd}) => extractCoreAppManifest({workDir: wd})
        : (params) => extractStudioManifest(params),
      httpHost: config.httpHost,
      httpPort: config.httpPort,
      isApp,
      outDir,
      output,
      reactStrictMode: resolveReactStrictMode(cliConfig) ?? false,
      workDir,
    })
  }

  try {
    const server = await startPreviewServer(config)
    return server
  } catch (err) {
    throw gracefulServerDeath('preview', config.httpHost, config.httpPort, err)
  }
}
