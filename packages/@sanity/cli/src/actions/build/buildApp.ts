import {rm} from 'node:fs/promises'
import path from 'node:path'

import {confirm} from '@inquirer/prompts'
import {getTimer, logSymbols, spinner} from '@sanity/cli-core'
import chalk from 'chalk'
import {type Ora} from 'ora'
import semver from 'semver'

import {compareDependencyVersions} from '../../util/compareDependencyVersions.js'
import {formatModuleSizes, sortModulesBySize} from '../../util/moduleFormatUtils.js'
import {readModuleVersion} from '../../util/readModuleVersion.js'
import {buildDebug} from './buildDebug.js'
import {buildStaticFiles} from './buildStaticFiles.js'
import {buildVendorDependencies} from './buildVendorDependencies.js'
import {determineBasePath} from './determineBasePath.js'
import {getAppEnvVars} from './getAppEnvVars.js'
import {getAppAutoUpdateImportMap} from './getAutoUpdatesImportMap.js'
import {type BuildOptions} from './types.js'

/**
 * Build the Sanity app.
 *
 * @internal
 */
export async function buildApp(options: BuildOptions): Promise<void> {
  const {autoUpdatesEnabled, cliConfig, exit, flags, outDir, output, workDir} = options
  const unattendedMode = flags.yes
  const timer = getTimer()

  const defaultOutputDir = path.resolve(path.join(workDir, 'dist'))
  const outputDir = path.resolve(outDir || defaultOutputDir)

  const installedSdkVersion = await readModuleVersion(outputDir, '@sanity/sdk-react')
  const installedSanityVersion = await readModuleVersion(outputDir, 'sanity')

  if (!installedSdkVersion) {
    throw new Error(`Failed to find installed @sanity/sdk-react version`)
  }

  // Get the version without any tags if any
  const coercedSdkVersion = semver.coerce(installedSdkVersion)?.version
  // Sanity might not be installed, but if it is we want to auto update it.
  const coercedSanityVersion = semver.coerce(installedSanityVersion)?.version
  if (autoUpdatesEnabled && !coercedSdkVersion) {
    throw new Error(`Failed to parse installed SDK version: ${installedSdkVersion}`)
  }
  const sdkVersion = encodeURIComponent(`^${coercedSdkVersion}`)
  const sanityVersion = coercedSanityVersion && encodeURIComponent(`^${coercedSanityVersion}`)
  const autoUpdatesImports = getAppAutoUpdateImportMap({sanityVersion, sdkVersion})

  if (autoUpdatesEnabled) {
    output.log(`${logSymbols.info} Building with auto-updates enabled`)

    // Check the versions
    const result = await compareDependencyVersions(autoUpdatesImports, workDir)

    // If it is in unattended mode, we don't want to prompt
    if (result?.length && !unattendedMode) {
      const shouldContinue = await confirm({
        default: false,
        message: chalk.yellow(
          `The following local package versions are different from the versions currently served at runtime.\n` +
            `When using auto updates, we recommend that you test locally with the same versions before deploying. \n\n` +
            `${result.map((mod) => ` - ${mod.pkg} (local version: ${mod.installed}, runtime version: ${mod.remote})`).join('\n')} \n\n` +
            `Continue anyway?`,
        ),
      })

      if (!shouldContinue) {
        return exit(1)
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
  if (outputDir !== defaultOutputDir && !unattendedMode) {
    shouldClean = await confirm({
      default: true,
      message: `Do you want to delete the existing directory (${outputDir}) first?`,
    })
  }

  // Determine base path for built studio
  const basePath = determineBasePath(cliConfig, 'app')

  let spin: Ora
  if (shouldClean) {
    timer.start('cleanOutputFolder')
    spin = spinner('Clean output folder').start()
    await rm(outputDir, {force: true, recursive: true})
    const cleanDuration = timer.end('cleanOutputFolder')
    spin.text = `Clean output folder (${cleanDuration.toFixed(0)}ms)`
    spin.succeed()
  }

  spin = spinner(`Building Sanity application`).start()

  // TODO: telemetry
  // const trace = telemetry.trace(BuildTrace)
  // trace.start()

  let importMap: {imports?: Record<string, string>} | undefined

  if (autoUpdatesEnabled) {
    importMap = {
      imports: {
        ...(await buildVendorDependencies({basePath, cwd: workDir, outputDir})),
        ...autoUpdatesImports,
      },
    }
  }

  try {
    timer.start('bundleStudio')

    const bundle = await buildStaticFiles({
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

    // TODO: telemetry
    // trace.log({
    //   outputSize: bundle.chunks
    //     .flatMap((chunk) => chunk.modules.flatMap((mod) => mod.renderedLength))
    //     .reduce((sum, n) => sum + n, 0),
    // })
    const buildDuration = timer.end('bundleStudio')

    spin.text = `Build Sanity application (${buildDuration.toFixed(0)}ms)`
    spin.succeed()

    if (flags.stats) {
      output.log('\nLargest module files:')
      output.log(formatModuleSizes(sortModulesBySize(bundle.chunks).slice(0, 15)))
    }
  } catch (error) {
    spin.fail()
    const message = error instanceof Error ? error.message : String(error)
    buildDebug(`Failed to build Sanity application`, {error})
    output.error(`Failed to build Sanity application: ${message}`, {exit: 1})
  }
}
