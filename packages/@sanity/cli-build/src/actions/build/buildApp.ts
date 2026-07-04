import {rm} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {
  type CliConfig,
  getCliTelemetry,
  getLocalPackageVersion,
  getTimer,
  isInteractive,
  type Output,
  type UserViteConfig,
} from '@sanity/cli-core'
import {confirm, logSymbols, spinner, type SpinnerInstance} from '@sanity/cli-core/ux'
import {type WorkbenchExposes} from '@sanity/workbench-cli/build'
import {parse as semverParse} from 'semver'

import {AppBuildTrace} from '../../telemetry/build.telemetry.js'
import {CompareDependencyVersionsResult} from '../../util/compareDependencyVersions.js'
import {formatModuleSizes, sortModulesBySize} from '../../util/moduleFormatUtils.js'
import {buildDebug} from './buildDebug.js'
import {buildStaticFiles} from './buildStaticFiles.js'
import {getAutoUpdatesCssUrls, getAutoUpdatesImportMap} from './getAutoUpdatesImportMap.js'
import {getAppEnvironmentVariables} from './getEnvironmentVariables.js'
import {handlePrereleaseVersions} from './handlePrereleaseVersions.js'
import {resolveVendorBuildConfig} from './resolveVendorBuildConfig.js'

export interface BuildOptions {
  appId: string | undefined
  appTitle: string | undefined
  autoUpdatesEnabled: boolean
  checkAppId: () => void
  compareDependencyVersions: (
    packages: {name: string; version: string}[],
  ) => Promise<CompareDependencyVersionsResult>
  determineBasePath: () => string
  entry: string | undefined
  isWorkbenchApp: boolean
  minify: boolean
  outDir: string | undefined
  output: Output
  reactCompiler: CliConfig['reactCompiler']
  schemaExtraction: CliConfig['schemaExtraction']
  sourceMap: boolean
  stats: boolean
  unattendedMode: boolean
  vite: UserViteConfig | undefined
  workDir: string

  exposes?: WorkbenchExposes
}

/**
 * Internal build app that avoids depending on flags for CLI config.
 * @param options - options for the build
 */
export async function buildApp(options: BuildOptions): Promise<void> {
  buildDebug(`Building app`)

  const {appId, determineBasePath, outDir, output, workDir} = options
  let {autoUpdatesEnabled} = options
  const unattendedMode = options.unattendedMode

  const timer = getTimer()

  const defaultOutputDir = path.resolve(path.join(workDir, 'dist'))
  const outputDir = path.resolve(outDir || defaultOutputDir)

  const installedSdkVersion = await getLocalPackageVersion('@sanity/sdk-react', workDir)
  const installedSanityVersion = await getLocalPackageVersion('sanity', workDir)

  if (!installedSdkVersion) {
    output.error(`Failed to find installed @sanity/sdk-react version`, {exit: 1})
    return
  }

  let autoUpdatesImports = {}
  let autoUpdatesCssUrls: string[] = []

  if (autoUpdatesEnabled) {
    // Get the clean version without build metadata: https://semver.org/#spec-item-10
    const cleanSDKVersion = semverParse(installedSdkVersion)?.version
    if (!cleanSDKVersion) {
      output.error(`Failed to parse installed SDK version: ${installedSdkVersion}`, {exit: 1})
      return
    }

    // Sanity might not be installed, but if it is, we want to auto update it.
    const cleanSanityVersion = semverParse(installedSanityVersion)?.version

    const autoUpdatedPackages = [
      {name: '@sanity/sdk', version: cleanSDKVersion},
      {name: '@sanity/sdk-react', version: cleanSDKVersion},
      ...(cleanSanityVersion
        ? [{cssFile: 'index.css', name: 'sanity' as const, version: cleanSanityVersion}]
        : []),
    ]
    autoUpdatesImports = getAutoUpdatesImportMap(autoUpdatedPackages, {appId})
    autoUpdatesCssUrls = getAutoUpdatesCssUrls(autoUpdatedPackages, {appId})

    output.log(`${logSymbols.info} Building with auto-updates enabled`)

    // Warn if auto updates enabled but no appId configured.
    options.checkAppId()

    // Check the versions
    const {mismatched, unresolvedPrerelease} =
      await options.compareDependencyVersions(autoUpdatedPackages)

    if (unresolvedPrerelease.length > 0) {
      await handlePrereleaseVersions({output, unattendedMode, unresolvedPrerelease})
      autoUpdatesImports = {}
      autoUpdatesCssUrls = []
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

  const envVarKeys = Object.keys(getAppEnvironmentVariables())
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

  const basePath = determineBasePath()

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

  let autoUpdates
  if (autoUpdatesEnabled && !options.isWorkbenchApp) {
    autoUpdates = {
      cssUrls: autoUpdatesCssUrls,
      imports: autoUpdatesImports,
      vendor: await resolveVendorBuildConfig({cwd: workDir, isApp: true}),
    }
  }

  try {
    timer.start('bundleStudio')

    const bundle = await buildStaticFiles({
      appTitle: options.appTitle,
      autoUpdates,
      basePath,
      cwd: workDir,
      entry: options.entry,
      exposes: options.exposes,
      isApp: true,
      isWorkbenchApp: options.isWorkbenchApp,
      minify: options.minify,
      outputDir,
      reactCompiler: options.reactCompiler,
      schemaExtraction: options.schemaExtraction,
      sourceMap: options.sourceMap,
      vite: options.vite,
    })

    trace.log({
      outputSize: bundle.chunks
        .flatMap((chunk) => chunk.modules.flatMap((mod) => mod.renderedLength))
        .reduce((sum, n) => sum + n, 0),
    })
    const buildDuration = timer.end('bundleStudio')

    spin.text = `Build Sanity application (${buildDuration.toFixed(0)}ms)`
    spin.succeed()

    if (options.stats) {
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
