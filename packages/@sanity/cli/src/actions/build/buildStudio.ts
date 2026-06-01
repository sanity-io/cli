import {buildStudio as internalBuildStudio} from '@sanity/cli-build/_internal/build'

import {getAppId} from '../../util/appId.js'
import {determineIsApp} from '../../util/determineIsApp.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {upgradePackages} from '../../util/packageManager/upgradePackages.js'
import {determineBasePath} from './determineBasePath.js'
import {getStudioEnvironmentVariables} from './getEnvironmentVariables.js'
import {type BuildOptions} from './types.js'

/**
 * Build the Sanity Studio.
 *
 * @internal
 */
export async function buildStudio(options: BuildOptions): Promise<void> {
  const {calledFromDeploy, cliConfig, flags, outDir, output, workDir} = options

  const upgradePkgs = async (options: {
    packages: [name: string, version: string][]
  }): Promise<void> => {
    await upgradePackages(
      {
        packageManager: (await getPackageManagerChoice(workDir, {interactive: false})).chosen,
        packages: options.packages,
      },
      {output, workDir},
    )
  }

  await internalBuildStudio({
    appId: getAppId(cliConfig),
    autoUpdatesEnabled: options.autoUpdatesEnabled,
    calledFromDeploy,
    determineBasePath: () => determineBasePath(cliConfig, 'studio', output),
    getEnvironmentVariables(options) {
      return getStudioEnvironmentVariables({
        jsonEncode: options?.jsonEncode,
        prefix: options?.prefix,
      })
    },
    isApp: determineIsApp(cliConfig),
    minify: Boolean(flags.minify),
    outDir,
    output,
    projectId: cliConfig?.api?.projectId,
    reactCompiler: cliConfig.reactCompiler,
    schemaExtraction: cliConfig.schemaExtraction,
    sourceMap: Boolean(flags['source-maps']),
    stats: flags.stats,
    unattendedMode: Boolean(flags.yes),
    upgradePackages: upgradePkgs,
    vite: cliConfig.vite,
    workDir,
  })
}
