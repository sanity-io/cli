import {
  compareDependencyVersions,
  buildApp as internalBuildApp,
} from '@sanity/cli-build/_internal/build'
import {resolveWorkbenchApp} from '@sanity/workbench-cli/build'

import {getAppId} from '../../util/appId.js'
import {warnAboutMissingAppId} from '../../util/warnAboutMissingAppId.js'
import {determineBasePath} from './determineBasePath.js'
import {type BuildOptions} from './types.js'

/**
 * Build the Sanity app.
 *
 * @internal
 */
export async function buildApp(options: BuildOptions): Promise<void> {
  const {cliConfig, flags, outDir, output, workDir} = options

  const app = cliConfig && 'app' in cliConfig ? cliConfig.app : undefined
  // `views`/`services` live on the branded `unstable_defineApp` result, not the
  // legacy `app` config object — resolve the workbench capability to read them.
  const workbench = resolveWorkbenchApp(cliConfig)

  const appId = getAppId(cliConfig)

  await internalBuildApp({
    appId,
    appTitle: app?.title,
    autoUpdatesEnabled: options.autoUpdatesEnabled,
    checkAppId: () => {
      // Warn if auto updates enabled but no appId configured.
      // Skip when called from deploy, since deploy handles appId itself
      // (prompts the user and tells them to add it to config).
      if (!appId && !options.calledFromDeploy) {
        warnAboutMissingAppId({appType: 'app', output})
      }
    },
    compareDependencyVersions: (packages) => compareDependencyVersions(packages, workDir, {appId}),
    determineBasePath: () => determineBasePath(cliConfig, 'app', output),
    entry: app?.entry,
    exposes: workbench
      ? {
          config: workbench.config,
          services: workbench.services,
          views: workbench.views,
        }
      : undefined,
    isWorkbenchApp: !!workbench,
    minify: flags.minify,
    outDir,
    output,
    reactCompiler: cliConfig && 'reactCompiler' in cliConfig ? cliConfig.reactCompiler : undefined,
    schemaExtraction: cliConfig?.schemaExtraction,
    sourceMap: Boolean(flags['source-maps']),
    stats: flags.stats,
    unattendedMode: flags.yes,
    vite: cliConfig.vite,
    workbenchAppId: workbench?.name,
    workDir,
  })
}
