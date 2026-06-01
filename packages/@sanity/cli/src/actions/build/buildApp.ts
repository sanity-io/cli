import {buildApp as internalBuildApp} from '@sanity/cli-build/_internal/build'

import {getAppId} from '../../util/appId.js'
import {determineBasePath} from './determineBasePath.js'
import {getAppEnvironmentVariables} from './getEnvironmentVariables.js'
import {type BuildOptions} from './types.js'

/**
 * Build the Sanity app.
 *
 * @internal
 */
export async function buildApp(options: BuildOptions): Promise<void> {
  const {cliConfig, flags, outDir, output, workDir} = options

  await internalBuildApp({
    appId: getAppId(cliConfig),
    appTitle: cliConfig && 'app' in cliConfig ? cliConfig.app?.title : undefined,
    autoUpdatesEnabled: options.autoUpdatesEnabled,
    calledFromDeploy: options.calledFromDeploy,
    determineBasePath: () => determineBasePath(cliConfig, 'app', output),
    entry: cliConfig && 'app' in cliConfig ? cliConfig.app?.entry : undefined,
    getEnvironmentVariables(options) {
      return getAppEnvironmentVariables({jsonEncode: options?.jsonEncode, prefix: options?.prefix})
    },
    minify: flags.minify,
    outDir,
    output,
    reactCompiler: cliConfig && 'reactCompiler' in cliConfig ? cliConfig.reactCompiler : undefined,
    schemaExtraction: cliConfig?.schemaExtraction,
    sourceMap: Boolean(flags['source-maps']),
    stats: flags.stats,
    unattendedMode: flags.yes,
    vite: cliConfig.vite,
    workDir,
  })
}
