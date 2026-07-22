import {styleText} from 'node:util'

import {
  compareDependencyVersions,
  buildStudio as internalBuildStudio,
} from '@sanity/cli-build/_internal/build'
import { logSymbols, select, spinner} from '@sanity/cli-core/ux'
import {buildAppId, resolveWorkbenchApp} from '@sanity/workbench-cli/build'

import {getAppId} from '../../util/appId.js'
import {determineIsApp} from '../../util/determineIsApp.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {upgradePackages} from '../../util/packageManager/upgradePackages.js'
import {warnAboutMissingAppId} from '../../util/warnAboutMissingAppId.js'
import {determineBasePath} from './determineBasePath.js'
import {
  checkDependenciesEventListenerFactory,
  preReleaseEventListenerFactory,
} from './eventListenerFactory.js'
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

  let cleanOutputDirSpinner: ReturnType<typeof spinner> | undefined
  let buildSpinner: ReturnType<typeof spinner> | undefined

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
    vite: cliConfig.vite,
    // Shared with deploy: it passes the resolved application id (minted by the
    // API on a first deploy) to inline; a plain build has none, so it hashes the shape.
    workbenchAppId: workbench
      ? (options.applicationId ?? (await buildAppId(workbench)))
      : undefined,
    workDir,

    eventListener: {
      ...preReleaseEventListenerFactory(output),

      ...checkDependenciesEventListenerFactory(output),

      onBuildEnd({message}) {
        if (buildSpinner) {
          buildSpinner.text = message
          buildSpinner.succeed()
        }
      },
      onBuildFail({message}) {
        if (buildSpinner) {
          buildSpinner.fail()
        }

        output.error(message, {exit: 1})
      },
      onBuildStart({message}) {
        if (!buildSpinner) {
          buildSpinner = spinner(message).start()
        }
      },
      onCleanOutputDirEnd({message}) {
        if (cleanOutputDirSpinner) {
          cleanOutputDirSpinner.text = message
          cleanOutputDirSpinner.succeed()
        }
      },
      onCleanOutputDirStart({message}) {
        if (!cleanOutputDirSpinner) {
          cleanOutputDirSpinner = spinner(message).start()
        }
      },
      async onVersionMismatchInInteractiveAutoUpdate({mismatched, versionMismatchWarning}) {
        const choice = await select({
          choices: [
            {
              name: `Upgrade local versions (recommended). You will need to run the build command again`,
              value: 'upgrade',
            },
            {
              name: `Upgrade and proceed with build`,
              value: 'upgrade-and-proceed',
            },
            {
              name: `Continue anyway`,
              value: 'continue',
            },
            {name: 'Cancel', value: 'cancel'},
          ],
          default: 'upgrade',
          message: styleText(
            'yellow',
            `${logSymbols.warning} ${versionMismatchWarning}\n\nDo you want to upgrade local versions before deploying?`,
          ),
        })

        if (choice === 'cancel') {
          output.error('Declined to continue with build', {exit: 1})
          return {stopBuild: true}
        }

        if (choice === 'upgrade' || choice === 'upgrade-and-proceed') {
          await upgradePackages(
            {
              packageManager: (await getPackageManagerChoice(workDir, {interactive: false})).chosen,
              packages: mismatched.map((res) => [res.pkg, res.remote]),
            },
            {output, workDir},
          )

          return {stopBuild: choice === 'upgrade'}
        }

        return {stopBuild: false}
      },
      onVersionMismatchInNonInteractiveAutoUpdate({versionMismatchWarning}) {
        output.warn(versionMismatchWarning)
      },
    },
  })
}
