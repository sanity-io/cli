import {rm} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {getLocalPackageVersion} from '@sanity/cli-core/package-manager'
import {getCliTelemetry} from '@sanity/cli-core/telemetry'
import {type CliConfig, type Output, type UserViteConfig} from '@sanity/cli-core/types'
import {isInteractive} from '@sanity/cli-core/util'
import {
  confirm,
  getTimer,
  logSymbols,
  select,
  spinner,
  type SpinnerInstance,
} from '@sanity/cli-core/ux'
import {type WorkbenchExposes} from '@sanity/workbench-cli/build'
import {parse as semverParse} from 'semver'

import {StudioBuildTrace} from '../../telemetry/build.telemetry.js'
import {CompareDependencyVersionsResult} from '../../util/compareDependencyVersions.js'
import {formatModuleSizes, sortModulesBySize} from '../../util/moduleFormatUtils.js'
import {buildDebug} from './buildDebug.js'
import {buildStaticFiles} from './buildStaticFiles.js'
import {checkRequiredDependencies} from './checkRequiredDependencies.js'
import {checkStudioDependencyVersions} from './checkStudioDependencyVersions.js'
import {getAutoUpdatesCssUrls, getAutoUpdatesImportMap} from './getAutoUpdatesImportMap.js'
import {getStudioEnvironmentVariables} from './getEnvironmentVariables.js'
import {handlePrereleaseVersions} from './handlePrereleaseVersions.js'
import {resolveVendorBuildConfig} from './resolveVendorBuildConfig.js'

export interface BuildOptions {
  appId: string | undefined
  autoUpdatesEnabled: boolean
  checkAppId: () => void
  compareDependencyVersions: (
    packages: {name: string; version: string}[],
  ) => Promise<CompareDependencyVersionsResult>
  determineBasePath: () => string
  isApp: boolean
  isWorkbenchApp: boolean
  minify: boolean
  outDir: string | undefined
  output: Output
  reactCompiler: CliConfig['reactCompiler']
  schemaExtraction: CliConfig['schemaExtraction']
  sourceMap: boolean
  stats: boolean
  unattendedMode: boolean
  upgradePackages(options: {packages: [name: string, version: string][]}): Promise<void>
  vite: UserViteConfig | undefined
  workDir: string

  exposes?: WorkbenchExposes

  /** The workbench app's bus identity (`__SANITY_APP_ID__`). */
  workbenchAppId?: string
}

/**
 * Internal build studio that avoids depending on flags for CLI config.
 * @param options - options for the build
 */
export async function buildStudio(options: BuildOptions): Promise<void> {
  buildDebug(`Building studio`)

  const timer = getTimer()
  const {
    appId,
    determineBasePath,
    exposes,
    isApp,
    minify,
    outDir,
    output,
    reactCompiler,
    schemaExtraction,
    sourceMap,
    stats,
    unattendedMode,
    upgradePackages,
    vite,
    workDir,
  } = options
  const defaultOutputDir = path.resolve(path.join(workDir, 'dist'))
  const outputDir = path.resolve(outDir || defaultOutputDir)

  await checkStudioDependencyVersions(workDir, output)

  // If the check resulted in a dependency install, the CLI command will be re-run,
  // thus we want to exit early
  const {installedSanityVersion} = await checkRequiredDependencies({
    isApp,
    output,
    workDir,
  })

  let autoUpdatesEnabled = options.autoUpdatesEnabled

  let autoUpdatesImports = {}
  let autoUpdatesCssUrls: string[] = []

  if (autoUpdatesEnabled) {
    // Get the clean version without build metadata: https://semver.org/#spec-item-10
    const cleanSanityVersion = semverParse(installedSanityVersion)?.version
    if (!cleanSanityVersion) {
      throw new Error(`Failed to parse installed Sanity version: ${installedSanityVersion}`)
    }

    output.log(`${logSymbols.info} Building with auto-updates enabled`)

    // Warn if auto updates enabled but no appId configured
    options.checkAppId()

    const installedVisionVersion = await getLocalPackageVersion('@sanity/vision', workDir)
    const cleanVisionVersion = installedVisionVersion
      ? semverParse(installedVisionVersion)?.version
      : undefined

    const sanityDependencies = [
      {cssFile: 'index.css', name: 'sanity', version: cleanSanityVersion},
      ...(cleanVisionVersion
        ? [{cssFile: 'index.css', name: '@sanity/vision' as const, version: cleanVisionVersion}]
        : [{name: '@sanity/vision' as const, version: cleanSanityVersion}]),
    ]
    autoUpdatesImports = getAutoUpdatesImportMap(sanityDependencies, {appId})

    autoUpdatesCssUrls = getAutoUpdatesCssUrls(sanityDependencies, {appId})

    // Check the versions
    const {mismatched, unresolvedPrerelease} =
      await options.compareDependencyVersions(sanityDependencies)

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
          await upgradePackages({
            packages: mismatched.map((res) => [res.pkg, res.remote]),
          })

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

  const envVarKeys = Object.keys(getStudioEnvironmentVariables())
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
  const basePath = determineBasePath()

  if (schemaExtraction?.enabled) {
    output.log(`${logSymbols.info} Building with schema extraction enabled`)
  }

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

  let autoUpdates
  if (autoUpdatesEnabled && !options.isWorkbenchApp) {
    autoUpdates = {
      cssUrls: autoUpdatesCssUrls,
      imports: autoUpdatesImports,
      vendor: await resolveVendorBuildConfig({cwd: workDir, isApp: false}),
    }
  }

  try {
    timer.start('bundleStudio')

    const bundle = await buildStaticFiles({
      autoUpdates,
      basePath,
      cwd: workDir,
      exposes,
      isWorkbenchApp: options.isWorkbenchApp,
      minify,
      outputDir,
      reactCompiler,
      schemaExtraction,
      sourceMap,
      vite,
      workbenchAppId: options.workbenchAppId,
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
    if (stats) {
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
