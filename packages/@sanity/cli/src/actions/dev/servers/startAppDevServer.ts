import {styleText} from 'node:util'

import {isWorkbenchApp} from '@sanity/cli-core'

import {startDevServer} from '../../../server/devServer.js'
import {gracefulServerDeath} from '../../../server/gracefulServerDeath.js'
import {devDebug} from '../devDebug.js'
import {type DevActionOptions, type StartDevServerResult} from '../types.js'
import {getDashboardAppURL} from './getDashboardAppUrl.js'
import {getDevServerConfig} from './getDevServerConfig.js'

export async function startAppDevServer(options: DevActionOptions): Promise<StartDevServerResult> {
  const {cliConfig, flags, httpPort, output, workbenchAvailable, workDir} = options

  // Workbench apps don't load through the dashboard, so the flag has no
  // meaning for them and is ignored.
  if (!isWorkbenchApp(cliConfig?.app) && !flags['load-in-dashboard']) {
    output.warn(`Apps cannot run without the Sanity dashboard`)
    output.warn(`Starting dev server with the --load-in-dashboard flag set to true`)
  }

  let organizationId: string | undefined
  if (cliConfig && 'app' in cliConfig && cliConfig.app?.organizationId) {
    organizationId = cliConfig.app.organizationId
  }

  if (!organizationId) {
    output.error(`Apps require an organization ID (orgId) specified in your sanity.cli.ts file`, {
      exit: 1,
    })
    return {reason: 'missing-organization-id', started: false}
  }

  const config = getDevServerConfig({cliConfig, flags, httpPort, output, workDir})

  try {
    output.log('Starting dev server')

    const appTitle = cliConfig && 'app' in cliConfig ? cliConfig.app?.title : undefined
    const {close, server} = await startDevServer({
      ...config,
      appTitle,
      isApp: true,
    })

    const {port} = server.config.server

    if (isWorkbenchApp(cliConfig?.app)) {
      // Federated apps surface through the workbench, so the dashboard URL is
      // meaningless for them. When the workbench runs, devAction announces its
      // URL instead — only the package-unavailable fallback logs from here.
      if (!workbenchAvailable) {
        output.log(`App dev server started on port ${port}`)
      }
    } else {
      const httpHost = config.httpHost || 'localhost'

      const dashboardAppUrl = await getDashboardAppURL({
        httpHost,
        httpPort: port,
        organizationId,
      })
      output.log(`Dev server started on port ${port}`)
      output.log(`View your app in the Sanity dashboard here:`)
      output.log(styleText(['blue', 'underline'], dashboardAppUrl))
    }

    return {close, server, started: true}
  } catch (err) {
    devDebug('Error starting app dev server', err)
    throw gracefulServerDeath('dev', config.httpHost, config.httpPort, err)
  }
}
