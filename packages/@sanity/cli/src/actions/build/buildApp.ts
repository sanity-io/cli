import {rm} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {getCliTelemetry, getTimer, isInteractive} from '@sanity/cli-core'
import {confirm, logSymbols, spinner, type SpinnerInstance} from '@sanity/cli-core/ux'
import semver from 'semver'

import {AppBuildTrace} from '../../telemetry/build.telemetry.js'
import {getAppId} from '../../util/appId.js'
import {compareDependencyVersions} from '../../util/compareDependencyVersions.js'
import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {formatModuleSizes, sortModulesBySize} from '../../util/moduleFormatUtils.js'
import {warnAboutMissingAppId} from '../../util/warnAboutMissingAppId.js'
import {buildDebug} from './buildDebug.js'
import {buildStaticFiles} from './buildStaticFiles.js'
import {buildVendorDependencies} from './buildVendorDependencies.js'
import {determineBasePath} from './determineBasePath.js'
import {getAppEnvVars} from './getAppEnvVars.js'
import {getAutoUpdatesImportMap} from './getAutoUpdatesImportMap.js'
import {handlePrereleaseVersions} from './handlePrereleaseVersions.js'
import {type BuildOptions} from './types.js'

/**
 * Build the Sanity app.
 *
 * @internal
 */
export async function buildApp(options: BuildOptions): Promise<void> {
  const {cliConfig, flags, outDir, output, workDir} = options
  let {autoUpdatesEnabled} = options
  const unattendedMode = flags.yes
  const timer = getTimer()

  const defaultOutputDir = path.resolve(path.join(workDir, 'dist'))
  const outputDir = path.resolve(outDir || defaultOutputDir)

  const appId = getAppId(cliConfig)

  const installedSdkVersion = await getLocalPackageVersion('@sanity/sdk-react', workDir)
  const installedSanityVersion = await getLocalPackageVersion('sanity', workDir)

  if (!installedSdkVersion) {
    output.error(`Failed to find installed @sanity/sdk-react version`, {exit: 1})
    return
  }

  let autoUpdatesImports = {}

  if (autoUpdatesEnabled) {
    // Get the clean version without build metadata: https://semver.org/#spec-item-10
    const cleanSDKVersion = semver.parse(installedSdkVersion)?.version
    if (!cleanSDKVersion) {
      output.error(`Failed to parse installed SDK version: ${installedSdkVersion}`, {exit: 1})
      return
    }

    // Sanity might not be installed, but if it is, we want to auto update it.
    const cleanSanityVersion = semver.parse(installedSanityVersion)?.version

    const autoUpdatedPackages = [
      {name: '@sanity/sdk', version: cleanSDKVersion},
      {name: '@sanity/sdk-react', version: cleanSDKVersion},
      ...(cleanSanityVersion ? [{name: 'sanity' as const, version: cleanSanityVersion}] : []),
    ]
    autoUpdatesImports = getAutoUpdatesImportMap(autoUpdatedPackages, {appId})

    output.log(`${logSymbols.info} Building with auto-updates enabled`)

    // Warn if auto updates enabled but no appId configured.
    // Skip when called from deploy, since deploy handles appId itself
    // (prompts the user and tells them to add it to config).
    if (!appId && !options.calledFromDeploy) {
      warnAboutMissingAppId({appType: 'app', output})
    }

    // Check the versions
    const {mismatched, unresolvedPrerelease} = await compareDependencyVersions(
      autoUpdatedPackages,
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
        const shouldContinue = await confirm({
          default: false,
          message: styleText('yellow', `${versionMismatchWarning} \n\nContinue anyway?`),
        })

        if (!shouldContinue) {
          output.error('Declined to continue with build', {exit: 1})
          return
        }
      } else {
        // if non-interactive or unattended, just show the warning
        output.warn(versionMismatchWarning)
      }
    }
  }

  const envVarKeys = getAppEnvVars()
  if (envVarKeys.length > 0) {
    output.log('\nIncluding the following environment variables as part of the JavaScript bundle:')
    for (const key of envVarKeys) output.log(`- ${key}`)
    output.log('')
  }

  let shouldClean = true
  if (outputDir !== defaultOutputDir && !unattendedMode && isInteractive()) {
    shouldClean = await confirm({
      default: true,
      message: `Do you want to delete the existing directory (${outputDir}) first?`,
    })
  }

  // Determine base path for built app
  const basePath = determineBasePath(cliConfig, 'app', output)

  let spin: SpinnerInstance
  if (shouldClean) {
    timer.start('cleanOutputFolder')
    spin = spinner('Clean output folder').start()
    await rm(outputDir, {force: true, recursive: true})
    const cleanDuration = timer.end('cleanOutputFolder')
    spin.text = `Clean output folder (${cleanDuration.toFixed(0)}ms)`
    spin.succeed()
  }

  spin = spinner(`Building Sanity application`).start()

  const trace = getCliTelemetry().trace(AppBuildTrace)
  trace.start()

  let importMap: {imports?: Record<string, string>} | undefined

  if (autoUpdatesEnabled) {
    importMap = {
      imports: {
        ...(await buildVendorDependencies({basePath, cwd: workDir, isApp: true, outputDir})),
        ...autoUpdatesImports,
      },
    }
  }

  try {
    timer.start('bundleStudio')

    const bundle = await buildStaticFiles({
      appTitle: cliConfig && 'app' in cliConfig ? cliConfig.app?.title : undefined,
      basePath,
      cwd: workDir,
      entry: cliConfig && 'app' in cliConfig ? cliConfig.app?.entry : undefined,
      importMap,
      isApp: true,
      minify: Boolean(flags.minify),
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

    spin.text = `Build Sanity application (${buildDuration.toFixed(0)}ms)`
    spin.succeed()

    if (flags.stats) {
      output.log('\nLargest module files:')
      output.log(formatModuleSizes(sortModulesBySize(bundle.chunks).slice(0, 15)))
    }

    trace.complete()
  } catch (error) {
    spin.fail()
    trace.error(error)
    const message = error instanceof Error ? error.message : String(error)
    buildDebug(`Failed to build Sanity application`, {error})
    output.error(`Failed to build Sanity application: ${message}`, {exit: 1})
  }
}
