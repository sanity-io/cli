import {
  compareDependencyVersions,
  buildStudio as internalBuildStudio,
} from '@sanity/cli-build/_internal/build'
import {buildAppId, resolveWorkbenchApp} from '@sanity/workbench-cli/build'

import {getAppId} from '../../util/appId.js'
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
  const exposes = workbench ? {services: workbench.services, views: workbench.views} : undefined

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
    exposes,
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
    // Shared with deploy: it passes the resolved application id (minted by the
    // API on a first deploy) to inline; a plain build has none, so it hashes the shape.
    workbenchAppId: workbench ? (options.applicationId ?? buildAppId(workbench)) : undefined,
    workDir,
  })
}
