import {
  compareDependencyVersions,
  buildApp as internalBuildApp,
} from '@sanity/cli-build/_internal/build'
import {
  buildAppId,
  resolveAppEntry,
  resolveWorkbenchApp,
  resolveWorkbenchConfig,
} from '@sanity/workbench-cli/build'

import {getAppId} from '../../util/appId.js'
import {warnAboutMissingAppId} from '../../util/warnAboutMissingAppId.js'
import {ensureAppFunctionStack} from '../functions/ensureAppFunctionStack.js'
import {generateAppFunctionContracts} from '../functions/generateAppFunctionContracts.js'
import {prepareAppFunctionsEntry} from '../functions/prepareAppFunctionsEntry.js'
import {buildAppFunctions} from './buildAppFunctions.js'
import {determineBasePath} from './determineBasePath.js'
import {preReleaseEventListenerFactory} from './eventListenerFactory.js'
import {type BuildOptions} from './types.js'

/**
 * Build the Sanity app.
 *
 * @internal
 */
export async function buildApp(
  options: BuildOptions,
): Promise<{mfManifest: Record<string, unknown> | undefined}> {
  const {cliConfig, flags, outDir, output, workDir} = options
  const functionContracts = await generateAppFunctionContracts(workDir, true)

  const app = cliConfig && 'app' in cliConfig ? cliConfig.app : undefined
  // `views`/`webWorkers` live on the branded `defineApplication` result, not the
  // legacy `app` config object — resolve the workbench capability to read them. A
  // config is not an app: it resolves separately and only expands its `fields`.
  const workbench = resolveWorkbenchApp(cliConfig)
  const workbenchConfig = resolveWorkbenchConfig(cliConfig)
  const exposes = workbench
    ? {views: workbench.views, webWorkers: workbench.webWorkers}
    : workbenchConfig
      ? {config: {appType: workbenchConfig.appType, fields: workbenchConfig.fields}}
      : undefined
  const isWorkbench = !!workbench || !!workbenchConfig

  const functionStack = options.calledFromDeploy
    ? null
    : await ensureAppFunctionStack({cliConfig, output, unattended: flags.yes, workDir})
  const appId = options.applicationId ?? functionStack?.appId ?? getAppId(cliConfig)
  const functionStackId = options.functionStackId ?? functionStack?.stackId
  const entry = await prepareAppFunctionsEntry({
    appId,
    entry: resolveAppEntry(app) ?? (isWorkbench ? undefined : './src/App'),
    organizationId: app?.organizationId,
    stackId: functionStackId,
    workDir,
  })

  const result = await internalBuildApp({
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
    entry,
    exposes,
    isWorkbenchApp: isWorkbench,
    minify: flags.minify,
    outDir,
    output,
    reactCompiler: cliConfig && 'reactCompiler' in cliConfig ? cliConfig.reactCompiler : undefined,
    schemaExtraction: cliConfig?.schemaExtraction,
    sourceMap: Boolean(flags['source-maps']),
    stats: flags.stats,
    unattendedMode: flags.yes,
    vite: cliConfig.vite,
    // Apps with functions have a registered identity before either build or deploy.
    // Other local builds can still use a hash of the application's shape.
    workbenchAppId: workbench
      ? (options.applicationId ?? functionStack?.appId ?? (await buildAppId(workbench)))
      : undefined,
    workDir,

    eventListener: preReleaseEventListenerFactory(output),
  })

  await buildAppFunctions({
    appId,
    contracts: functionContracts,
    dryRun: 'dry-run' in flags && !!flags['dry-run'],
    organizationId: app?.organizationId,
    output,
    stackId: functionStackId,
    workDir,
  })

  return result
}
