import path from 'node:path'

import {confirm} from '@inquirer/prompts'
import {type Command} from '@oclif/core'
import logSymbols from 'log-symbols'
import semver from 'semver'

import {type CliConfig} from '../../config/cli/types.js'
import {spinner} from '../../core/spinner.js'
import {getTimer} from '../../core/timer.js'
import {formatModuleSizes, sortModulesBySize} from '../../util/moduleFormatUtils.js'
import {readModuleVersion} from '../../util/readModuleVersion.js'
import {buildStaticFiles} from './buildStaticFiles.js'
import {determineBasePath} from './determineBasePath.js'
import {getAppEnvVars} from './getAppEnvVars.js'
import {type BuildFlags} from './types.js'

interface BuildAppOptions {
  autoUpdatesEnabled: boolean
  cliConfig: CliConfig
  flags: BuildFlags
  log: Command['log']
  workDir: string

  outDir?: string
}

/**
 * Build the Sanity app.
 *
 * @internal
 */
export async function buildApp(options: BuildAppOptions) {
  const {autoUpdatesEnabled, cliConfig, flags, log, outDir, workDir} = options
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

  if (autoUpdatesEnabled) {
    log(`${logSymbols.info} Building with auto-updates enabled`)
    throw new Error(`TODO: Implement`)
  }

  const envVarKeys = getAppEnvVars()
  if (envVarKeys.length > 0) {
    log('\nIncluding the following environment variables as part of the JavaScript bundle:')
    for (const key of envVarKeys) log(`- ${key}`)
    log('')
  }

  let shouldClean = true
  if (outputDir !== defaultOutputDir && !unattendedMode) {
    shouldClean = await confirm({
      default: true,
      message: `Do you want to delete the existing directory (${outputDir}) first?`,
    })
  }

  // Determine base path for built studio
  const basePath = determineBasePath(cliConfig)

  let spin
  if (shouldClean) {
    timer.start('cleanOutputFolder')
    spin = spinner('Clean output folder').start()
    // await rimraf(outputDir)
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
        // ...(await buildVendorDependencies({cwd: workDir, outputDir, basePath})),
        // ...autoUpdatesImports,
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

    if (flags.stats) {
      log('\nLargest module files:')
      log(formatModuleSizes(sortModulesBySize(bundle.chunks).slice(0, 15)))
    }
  } catch (error) {
    spin.fail()
    // trace.error(err)
    throw error
  }
}
