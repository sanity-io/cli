import {buildStudio as internalBuildStudio} from '@sanity/cli-build/_internal/build'
import {resolveWorkbenchApp} from '@sanity/workbench-cli/build'

import {getAppId} from '../../util/appId.js'
import {compareDependencyVersions} from '../../util/compareDependencyVersions.js'
import {determineIsApp} from '../../util/determineIsApp.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {upgradePackages} from '../../util/packageManager/upgradePackages.js'
import {warnAboutMissingAppId} from '../../util/warnAboutMissingAppId.js'
import {determineBasePath} from './determineBasePath.js'
import {type BuildOptions} from './types.js'

/**
 * Build the Sanity Studio.
 *
 * @internal
 */
export async function buildStudio(options: BuildOptions): Promise<void> {
  const {calledFromDeploy, cliConfig, flags, outDir, output, workDir} = options

  // `views`/`services` live on the branded `unstable_defineApp` result — resolve
  // the workbench capability so it's gated on the brand, like the app build.
  const workbench = resolveWorkbenchApp(cliConfig)

  const appId = getAppId(cliConfig)

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
    appId,
    autoUpdatesEnabled: options.autoUpdatesEnabled,
    checkAppId: () => {
      // Warn if auto updates enabled but no appId configured.
      // Skip when called from deploy, since deploy handles appId itself
      // (prompts the user and tells them to add it to config).
      if (!appId && !calledFromDeploy) {
        warnAboutMissingAppId({appType: 'studio', output, projectId: cliConfig?.api?.projectId})
      }
    },
    compareDependencyVersions: (packages) => compareDependencyVersions(packages, workDir, {appId}),
    determineBasePath: () => determineBasePath(cliConfig, 'studio', output),
    exposes: workbench ? {services: workbench.services, views: workbench.views} : undefined,
    isApp: determineIsApp(cliConfig),
    isWorkbenchApp: !!workbench,
    minify: Boolean(flags.minify),
    outDir,
    output,
    reactCompiler: cliConfig.reactCompiler,
    schemaExtraction: cliConfig.schemaExtraction,
    sourceMap: Boolean(flags['source-maps']),
    stats: flags.stats,
    unattendedMode: Boolean(flags.yes),
    upgradePackages: upgradePkgs,
    vite: cliConfig.vite,
    // The bus identity `@sanity/runtime` stamps on messages: the deployed
    // application id when configured, else the app's `unstable_defineApp` name.
    workbenchAppId: workbench ? (appId ?? workbench.name) : undefined,
    workDir,
  })
}
