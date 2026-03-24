import {styleText} from 'node:util'

import {isInteractive} from '@sanity/cli-core'
import {confirm, logSymbols, spinner} from '@sanity/cli-core/ux'
import semver from 'semver'

import {startDevServer} from '../../server/devServer.js'
import {gracefulServerDeath} from '../../server/gracefulServerDeath.js'
import {getProjectById} from '../../services/projects.js'
import {getAppId} from '../../util/appId.js'
import {compareDependencyVersions} from '../../util/compareDependencyVersions.js'
import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {upgradePackages} from '../../util/packageManager/upgradePackages.js'
import {checkRequiredDependencies} from '../build/checkRequiredDependencies.js'
import {checkStudioDependencyVersions} from '../build/checkStudioDependencyVersions.js'
import {shouldAutoUpdate} from '../build/shouldAutoUpdate.js'
import {devDebug} from './devDebug.js'
import {getDashboardAppURL} from './getDashboardAppUrl.js'
import {getDevServerConfig} from './getDevServerConfig.js'
import {type DevActionOptions} from './types.js'

export async function startStudioDevServer(
  options: DevActionOptions,
): Promise<{close?: () => Promise<void>; port?: number}> {
  const {cliConfig, flags, output, workDir} = options
  const projectId = cliConfig?.api?.projectId
  let organizationId: string | undefined

  const loadInDashboard = flags['load-in-dashboard']

  // Check studio dependency versions
  await checkStudioDependencyVersions(workDir, output)

  const {installedSanityVersion} = await checkRequiredDependencies(options)

  // Check if auto-updates are enabled
  const autoUpdatesEnabled = shouldAutoUpdate({cliConfig, flags, output})

  if (autoUpdatesEnabled) {
    // Get the clean version without build metadata: https://semver.org/#spec-item-10
    const cleanSanityVersion = semver.parse(installedSanityVersion)?.version
    if (!cleanSanityVersion) {
      throw new Error(`Failed to parse installed Sanity version: ${installedSanityVersion}`)
    }

    const sanityDependencies = [
      {name: 'sanity', version: cleanSanityVersion},
      {name: '@sanity/vision', version: cleanSanityVersion},
    ]

    output.log(`${logSymbols.info} Running with auto-updates enabled`)

    // Check local versions against deployed versions
    let result: Awaited<ReturnType<typeof compareDependencyVersions>> | undefined

    const appId = getAppId(cliConfig)

    try {
      result = await compareDependencyVersions(sanityDependencies, workDir, {appId})
    } catch (err) {
      output.warn(`Failed to compare local versions against auto-updating versions: ${err}`)
    }

    if (result?.unresolvedPrerelease.length) {
      for (const mod of result.unresolvedPrerelease) {
        output.warn(
          `Your local version of ${mod.pkg} (${mod.version}) is a prerelease not available on the auto-updates CDN. The locally installed version will be used.`,
        )
      }
    }

    // mismatch between local and auto-updating dependencies
    if (result?.mismatched.length) {
      const message =
        `The following local package versions are different from the versions currently served at runtime.\n` +
        `When using auto updates, we recommend that you run with the same versions locally as will be used when deploying.\n\n` +
        `${result.mismatched.map((mod) => ` - ${mod.pkg} (local version: ${mod.installed}, runtime version: ${mod.remote})`).join('\n')}\n\n`

      if (isInteractive()) {
        const shouldUpgrade = await confirm({
          default: true,
          message: styleText('yellow', `${message}Do you want to upgrade local versions?`),
        })
        if (shouldUpgrade) {
          await upgradePackages(
            {
              packageManager: (await getPackageManagerChoice(workDir, {interactive: false})).chosen,
              packages: result.mismatched.map((res) => [res.pkg, res.remote]),
            },
            {output, workDir},
          )
        }
      } else {
        // In this case we warn the user but we don't ask them if they want to upgrade because it's not interactive.
        output.log(styleText('yellow', message))
      }
    }
  }

  if (cliConfig?.schemaExtraction?.enabled) {
    output.log(`${logSymbols.info} Running dev server with schema extraction enabled`)
  }

  const config = getDevServerConfig({cliConfig, flags, output, workDir})

  if (loadInDashboard) {
    if (!projectId) {
      output.error('Project Id is required to load in dashboard', {exit: 1})
    }

    try {
      const project = await getProjectById(projectId!)
      organizationId = project.organizationId!
    } catch (error) {
      devDebug('Error getting organization id from project id', error)
      output.error('Failed to get organization id from project id', {exit: 1})
    }
  }

  try {
    const startTime = Date.now()
    const spin = spinner('Starting dev server').start()
    const {close, server} = await startDevServer(config)

    const {info: loggerInfo} = server.config.logger
    const {port} = server.config.server
    const httpHost = config.httpHost || 'localhost'

    if (loadInDashboard) {
      spin.succeed()

      output.log(`Studio dev server started on port ${port}`)
      output.log(`View your studio in the Sanity dashboard here:`)
      output.log(
        styleText(
          ['blue', 'underline'],
          await getDashboardAppURL({
            httpHost,
            httpPort: port,
            organizationId: organizationId!,
          }),
        ),
      )
    } else {
      const startupDuration = Date.now() - startTime
      const url = `http://${httpHost || 'localhost'}:${port}${config.basePath}`
      const appType = 'Sanity Studio'

      const viteVersion = await getLocalPackageVersion('vite', import.meta.url)
      spin.succeed()

      loggerInfo(
        `${appType} ` +
          `using ${styleText('cyan', `vite@${viteVersion}`)} ` +
          `ready in ${styleText('cyan', `${Math.ceil(startupDuration)}ms`)} ` +
          `and running at ${styleText('cyan', url)}`,
      )
    }

    return {close, port}
  } catch (err) {
    devDebug('Error starting studio dev server', err)
    throw gracefulServerDeath('dev', config.httpHost, config.httpPort, err)
  }
}
