import {styleText} from 'node:util'

import {isWorkbenchApp as determineIsWorkbenchApp} from '@sanity/workbench-cli'

import {startDevServer} from '../../../server/devServer.js'
import {gracefulServerDeath} from '../../../server/gracefulServerDeath.js'
import {devDebug} from '../devDebug.js'
import {type DevActionOptions, type StartDevServerResult} from '../types.js'
import {getDashboardAppURL} from './getDashboardAppUrl.js'
import {getDevServerConfig} from './getDevServerConfig.js'

// Bind-only addresses ('0.0.0.0', '::') aren't routable in every browser; the
// displayed URL falls back to localhost. The bind address itself is untouched.
function toDisplayHost(host: string | undefined): string {
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') {
    return 'localhost'
  }
  return host
}

export async function startAppDevServer(options: DevActionOptions): Promise<StartDevServerResult> {
  const {announceUrl = true, cliConfig, flags, httpPort, output, workDir} = options

  const isWorkbenchApp = determineIsWorkbenchApp(cliConfig?.app)

  // Workbench apps don't load through the dashboard, so the flag has no
  // meaning for them and is ignored.
  if (!isWorkbenchApp && !flags['load-in-dashboard']) {
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

    // Federated apps surface through the workbench, which announces the URL;
    // only the package-unavailable fallback announces from here.
    if (isWorkbenchApp && announceUrl) {
      const url = `http://${toDisplayHost(config.httpHost)}:${port}`
      output.log(`App dev server started at ${styleText(['blue', 'underline'], url)}`)
    } else if (!isWorkbenchApp) {
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
