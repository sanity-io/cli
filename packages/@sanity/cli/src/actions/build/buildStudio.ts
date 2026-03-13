import {rm} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {getCliTelemetry, getTimer, isInteractive} from '@sanity/cli-core'
import {confirm, logSymbols, select, spinner, type SpinnerInstance} from '@sanity/cli-core/ux'
import semver from 'semver'

import {StudioBuildTrace} from '../../telemetry/build.telemetry.js'
import {getAppId} from '../../util/appId.js'
import {compareDependencyVersions} from '../../util/compareDependencyVersions.js'
import {formatModuleSizes, sortModulesBySize} from '../../util/moduleFormatUtils.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {upgradePackages} from '../../util/packageManager/upgradePackages.js'
import {warnAboutMissingAppId} from '../../util/warnAboutMissingAppId.js'
import {buildDebug} from './buildDebug.js'
import {buildStaticFiles} from './buildStaticFiles.js'
import {buildVendorDependencies} from './buildVendorDependencies.js'
import {checkRequiredDependencies} from './checkRequiredDependencies.js'
import {checkStudioDependencyVersions} from './checkStudioDependencyVersions.js'
import {determineBasePath} from './determineBasePath.js'
import {getAutoUpdatesImportMap} from './getAutoUpdatesImportMap.js'
import {getStudioEnvVars} from './getStudioEnvVars.js'
import {handlePrereleaseVersions} from './handlePrereleaseVersions.js'
import {shouldAutoUpdate} from './shouldAutoUpdate.js'
import {type BuildOptions} from './types.js'

/**
 * Build the Sanity Studio.
 *
 * @internal
 */
export async function buildStudio(options: BuildOptions): Promise<void> {
  const timer = getTimer()
  const {cliConfig, flags, outDir, output, workDir} = options

  const unattendedMode = Boolean(flags.yes)
  const defaultOutputDir = path.resolve(path.join(workDir, 'dist'))
  const outputDir = path.resolve(outDir || defaultOutputDir)

  await checkStudioDependencyVersions(workDir, output)

  // If the check resulted in a dependency install, the CLI command will be re-run,
  // thus we want to exit early
  const {installedSanityVersion} = await checkRequiredDependencies({
    cliConfig,
    output,
    workDir,
  })

  let autoUpdatesEnabled = shouldAutoUpdate({cliConfig, flags, output})

  let autoUpdatesImports = {}

  if (autoUpdatesEnabled) {
    // Get the clean version without build metadata: https://semver.org/#spec-item-10
    const cleanSanityVersion = semver.parse(installedSanityVersion)?.version
    if (!cleanSanityVersion) {
      throw new Error(`Failed to parse installed Sanity version: ${installedSanityVersion}`)
    }

    output.log(`${logSymbols.info} Building with auto-updates enabled`)

    const projectId = cliConfig?.api?.projectId
    const appId = getAppId(cliConfig)

    // Warn if auto updates enabled but no appId configured.
    // Skip when called from deploy, since deploy handles appId itself
    // (prompts the user and tells them to add it to config).
    if (!appId && !options.calledFromDeploy) {
      warnAboutMissingAppId({appType: 'studio', output, projectId})
    }

    const sanityDependencies = [
      {name: 'sanity', version: cleanSanityVersion},
      {name: '@sanity/vision', version: cleanSanityVersion},
    ]
    autoUpdatesImports = getAutoUpdatesImportMap(sanityDependencies, {appId})

    // Check the versions
    const {mismatched, unresolvedPrerelease} = await compareDependencyVersions(
      sanityDependencies,
      workDir,
      {appId},
    )

    if (unresolvedPrerelease.length > 0) {
      await handlePrereleaseVersions({output, unattendedMode, unresolvedPrerelease})
      autoUpdatesImports = {}
      autoUpdatesEnabled = false
    }

    if (mismatched.length > 0 && autoUpdatesEnabled) {
      const versionMismatchWarning =
        `The following local package versions are different from the versions currently served at runtime.\n` +
        `When using auto updates, we recommend that you test locally with the same versions before deploying. \n\n` +
        `${mismatched.map((mod) => ` - ${mod.pkg} (local version: ${mod.installed}, runtime version: ${mod.remote})`).join('\n')}`

      // If it is non-interactive or in unattended mode, we don't want to prompt
      if (isInteractive() && !unattendedMode) {
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
          return
        }

        if (choice === 'upgrade' || choice === 'upgrade-and-proceed') {
          await upgradePackages(
            {
              packageManager: (await getPackageManagerChoice(workDir, {interactive: false})).chosen,
              packages: mismatched.map((res) => [res.pkg, res.remote]),
            },
            {output, workDir},
          )

          if (choice === 'upgrade') {
            return
          }
        }
      } else {
        // if non-interactive or unattended, just show the warning
        output.warn(versionMismatchWarning)
      }
    }
  }

  const envVarKeys = getStudioEnvVars()
  if (envVarKeys.length > 0) {
    output.log('\nIncluding the following environment variables as part of the JavaScript bundle:')
    for (const key of envVarKeys) {
      output.log(`- ${key}`)
    }
    output.log('')
  }

  let shouldClean = true
  if (outputDir !== defaultOutputDir && !unattendedMode && isInteractive()) {
    shouldClean = await confirm({
      default: true,
      message: `Do you want to delete the existing directory (${outputDir}) first?`,
    })
  }

  // Determine base path for built studio
  const basePath = determineBasePath(cliConfig, 'studio', output)

  let spin: SpinnerInstance
  if (shouldClean) {
    timer.start('cleanOutputFolder')
    spin = spinner('Clean output folder').start()
    await rm(outputDir, {force: true, recursive: true})
    const cleanDuration = timer.end('cleanOutputFolder')
    spin.text = `Clean output folder (${cleanDuration.toFixed(0)}ms)`
    spin.succeed()
  }

  spin = spinner(`Build Sanity Studio`).start()

  const trace = getCliTelemetry().trace(StudioBuildTrace)
  trace.start()

  let importMap

  if (autoUpdatesEnabled) {
    importMap = {
      imports: {
        ...(await buildVendorDependencies({basePath, cwd: workDir, isApp: false, outputDir})),
        ...autoUpdatesImports,
      },
    }
  }

  try {
    timer.start('bundleStudio')

    const bundle = await buildStaticFiles({
      basePath,
      cwd: workDir,
      importMap,
      minify: Boolean(flags.minify),
      output,
      outputDir,
      reactCompiler:
        cliConfig && 'reactCompiler' in cliConfig ? cliConfig.reactCompiler : undefined,
      sourceMap: Boolean(flags['source-maps']),
      vite: cliConfig && 'vite' in cliConfig ? cliConfig.vite : undefined,
    })

    trace.log({
      outputSize: bundle.chunks
        .flatMap((chunk) => chunk.modules.flatMap((mod) => mod.renderedLength))
        .reduce((sum, n) => sum + n, 0),
    })
    const buildDuration = timer.end('bundleStudio')

    spin.text = `Build Sanity Studio (${buildDuration.toFixed(0)}ms)`
    spin.succeed()

    trace.complete()
    if (flags.stats) {
      output.log('\nLargest module files:')
      output.log(formatModuleSizes(sortModulesBySize(bundle.chunks).slice(0, 15)))
    }
  } catch (error) {
    spin.fail()
    trace.error(error)
    const message = error instanceof Error ? error.message : String(error)
    buildDebug(`Failed to build Sanity Studio`, {error})
    output.error(`Failed to build Sanity Studio: ${message}`, {exit: 1})
  }
}
