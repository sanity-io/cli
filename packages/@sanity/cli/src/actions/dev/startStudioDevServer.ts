import {confirm} from '@inquirer/prompts'
import {isInteractive, logSymbols, spinner} from '@sanity/cli-core'
import chalk from 'chalk'
import semver from 'semver'

import {startDevServer} from '../../server/devServer.js'
import {gracefulServerDeath} from '../../server/gracefulServerDeath.js'
import {compareDependencyVersions} from '../../util/compareDependencyVersions.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {upgradePackages} from '../../util/packageManager/upgradePackages.js'
import {readModuleVersion} from '../../util/readModuleVersion.js'
import {checkRequiredDependencies} from '../build/checkRequiredDependencies.js'
import {checkStudioDependencyVersions} from '../build/checkStudioDependencyVersions.js'
import {getStudioAutoUpdateImportMap} from '../build/getAutoUpdatesImportMap.js'
import {shouldAutoUpdate} from '../build/shouldAutoUpdate.js'
import {devDebug} from './devDebug.js'
import {getCoreAppURL} from './getCoreAppUrl.js'
import {getDevServerConfig} from './getDevServerConfig.js'
import {type DevActionOptions} from './types.js'

export async function startStudioDevServer(
  options: DevActionOptions,
): Promise<{close?: () => Promise<void>}> {
  const {apiClient, cliConfig, flags, output, workDir} = options

  const loadInDashboard = flags['load-in-dashboard']

  // Check studio dependency versions
  await checkStudioDependencyVersions(workDir, output)

  const {installedSanityVersion} = await checkRequiredDependencies(options)

  // Check if auto-updates are enabled
  const autoUpdatesEnabled = shouldAutoUpdate({cliConfig, flags})

  if (autoUpdatesEnabled) {
    output.log(`${logSymbols.info} Running with auto-updates enabled`)

    // Get the version without any tags if any
    const coercedSanityVersion = semver.coerce(installedSanityVersion)?.version
    if (!coercedSanityVersion) {
      throw new Error(`Failed to parse installed Sanity version: ${installedSanityVersion}`)
    }
    const version = encodeURIComponent(`^${coercedSanityVersion}`)
    const autoUpdatesImports = getStudioAutoUpdateImportMap(version)

    // Check the versions
    const result = await compareDependencyVersions(autoUpdatesImports, workDir)

    const message =
      `The following local package versions are different from the versions currently served at runtime.\n` +
      `When using auto updates, we recommend that you run with the same versions locally as will be used when deploying.\n\n` +
      `${result.map((mod) => ` - ${mod.pkg} (local version: ${mod.installed}, runtime version: ${mod.remote})`).join('\n')}\n\n`

    // mismatch between local and auto-updating dependencies
    if (result?.length) {
      if (isInteractive) {
        const shouldUpgrade = await confirm({
          default: true,
          message: chalk.yellow(`${message}Do you want to upgrade local versions?`),
        })
        if (shouldUpgrade) {
          await upgradePackages(
            {
              packageManager: (await getPackageManagerChoice(workDir, {interactive: false})).chosen,
              packages: result.map((res) => [res.pkg, res.remote]),
            },
            {output, workDir},
          )
        }
      } else {
        // In this case we warn the user but we don't ask them if they want to upgrade because it's not interactive.
        output.log(chalk.yellow(message))
      }
    }
  }

  const config = getDevServerConfig({cliConfig, flags, output, workDir})

  const projectId = cliConfig?.api?.projectId
  let organizationId: string | null | undefined

  if (loadInDashboard) {
    if (!projectId) {
      output.error('Project Id is required to load in dashboard', {exit: 1})
      return {}
    }

    const client = await apiClient({
      apiVersion: '2025-08-25',
      requireUser: true,
    })

    try {
      const project = await client.request<{organizationId: string}>({
        uri: `/projects/${projectId}`,
      })
      organizationId = project.organizationId
    } catch (error) {
      devDebug('Error getting organization Id from project Id', error)
      output.error('Failed to get organization Id from project Id', {exit: 1})
    }
  }

  try {
    const startTime = Date.now()
    const spin = spinner('Starting dev server').start()
    const {close, server} = await startDevServer(config)

    const {info: loggerInfo} = server.config.logger
    const {port} = server.config.server
    const httpHost = config.httpHost || 'localhost'

    spin.succeed()

    if (loadInDashboard) {
      if (!organizationId) {
        output.error('Organization Id not found for project', {exit: 1})
        return {}
      }

      output.log(`Dev server started on port ${port}`)
      output.log(`View your studio in the Sanity dashboard here:`)
      output.log(
        chalk.blue(
          chalk.underline(
            await getCoreAppURL({
              httpHost,
              httpPort: port,
              organizationId,
            }),
          ),
        ),
      )
    } else {
      const startupDuration = Date.now() - startTime
      const url = `http://${httpHost || 'localhost'}:${port}${config.basePath}`
      const appType = 'Sanity Studio'

      const viteVersion = await readModuleVersion(import.meta.url, 'vite')

      loggerInfo(
        `${appType} ` +
          `using ${chalk.cyan(`vite@${viteVersion}`)} ` +
          `ready in ${chalk.cyan(`${Math.ceil(startupDuration)}ms`)} ` +
          `and running at ${chalk.cyan(url)}`,
      )
    }

    return {close}
  } catch (err) {
    devDebug('Error starting studio dev server', err)
    throw gracefulServerDeath('dev', config.httpHost, config.httpPort, err)
  }
}
