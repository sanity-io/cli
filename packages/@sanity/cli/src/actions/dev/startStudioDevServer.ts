import {confirm} from '@inquirer/prompts'
import chalk from 'chalk'
import semver from 'semver'

import {info} from '../../core/logSymbols.js'
import {spinner} from '../../core/spinner.js'
import {startDevServer} from '../../server/devServer.js'
import {gracefulServerDeath} from '../../server/gracefulServerDeath.js'
import {compareDependencyVersions} from '../../util/compareDependencyVersions.js'
import {isInteractive} from '../../util/isInteractive.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {upgradePackages} from '../../util/packageManager/upgradePackages.js'
import {checkRequiredDependencies} from '../build/checkRequiredDependencies.js'
import {checkStudioDependencyVersions} from '../build/checkStudioDependencyVersions.js'
import {getStudioAutoUpdateImportMap} from '../build/getAutoUpdatesImportMap.js'
import {shouldAutoUpdate} from '../build/shouldAutoUpdate.js'
import {getDevServerConfig} from './getDevServerConfig.js'
import {type DevActionOptions} from './types.js'

export async function startStudioDevServer(options: DevActionOptions): Promise<void> {
  const {apiClient, cliConfig, flags, output, workDir} = options

  const loadInDashboard = flags['load-in-dashboard']

  // Check studio dependency versions
  await checkStudioDependencyVersions(workDir, output)

  // Check required dependencies and exit early if they were installed
  const {didInstall, installedSanityVersion} = await checkRequiredDependencies(options)
  if (didInstall) {
    // If dependencies were installed, the CLI command will be re-run
    return
  }

  // Check if auto-updates are enabled
  const autoUpdatesEnabled = shouldAutoUpdate({cliConfig, flags})

  if (autoUpdatesEnabled) {
    output.log(`${info} Running with auto-updates enabled`)

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
      `When using auto updates, we recommend that you run with the same versions locally as will be used when deploying. \n\n` +
      `${result.map((mod) => ` - ${mod.pkg} (local version: ${mod.installed}, runtime version: ${mod.remote})`).join('\n')} \n\n`

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
      output.error('Project Id is required to load in dashboard')
      process.exit(1)
    }

    const client = await apiClient({
      apiVersion: '2024-01-01',
      requireUser: true,
    })

    try {
      const project = await client.request<{organizationId: string}>({
        uri: `/projects/${projectId}`,
      })
      organizationId = project.organizationId
    } catch {
      output.error('Failed to get organization Id from project Id', {exit: 1})
    }
  }

  try {
    const spin = spinner('Starting dev server').start()
    await startDevServer({...config, skipStartLog: loadInDashboard, spinner: spin})

    if (loadInDashboard) {
      if (!organizationId) {
        output.error('Organization Id not found for project', {exit: 1})
        return
      }

      output.log(`Dev server started on port ${config.httpPort}`)
      output.log(`View your studio in the Sanity dashboard here:`)
      output.log(
        chalk.blue(
          chalk.underline(
            await getCoreStudioURL({
              httpHost: config.httpHost,
              httpPort: config.httpPort,
              organizationId,
            }),
          ),
        ),
      )
    }
  } catch (err) {
    gracefulServerDeath('dev', config.httpHost, config.httpPort, err)
  }
}

// Similar to getCoreAppURL but for studio
async function getCoreStudioURL({
  httpHost = 'localhost',
  httpPort = 3333,
  organizationId,
}: {
  httpHost?: string
  httpPort?: number
  organizationId: string
}): Promise<string> {
  const url = `http://${httpHost}:${httpPort}`
  const params = new URLSearchParams({dev: url})

  // Use the appropriate environment URL
  const baseUrl =
    process.env.SANITY_INTERNAL_ENV === 'staging' ? 'https://sanity.work' : 'https://sanity.io'

  return `${baseUrl}/@${organizationId}?${params.toString()}`
}
