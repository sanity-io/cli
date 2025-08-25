import chalk from 'chalk'

import {startDevServer} from '../../server/devServer.js'
import {gracefulServerDeath} from '../../server/gracefulServerDeath.js'
import {devDebug} from './devDebug.js'
import {getCoreAppURL} from './getCoreAppUrl.js'
import {getDevServerConfig} from './getDevServerConfig.js'
import {type DevActionOptions} from './types.js'

export async function startAppDevServer(options: DevActionOptions): Promise<{close?: () => Promise<void>}> {
  const {cliConfig, flags, output, workDir} = options

  if (!flags['load-in-dashboard']) {
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
    return {}
  }

  const config = getDevServerConfig({cliConfig, flags, output, workDir})

  try {
    output.log('Starting dev server')

    const {close, server} = await startDevServer({...config, isApp: true})

    const {port} = server.config.server
    const httpHost = config.httpHost || 'localhost'

    const coreAppUrl = await getCoreAppURL({
      httpHost,
      httpPort: port,
      organizationId,
    })

    output.log(`Dev server started on port ${port}`)
    output.log(`View your app in the Sanity dashboard here:`)
    output.log(chalk.blue(chalk.underline(coreAppUrl)))

    return {close}
  } catch (err) {
    devDebug('Error starting app dev server', err)
    throw gracefulServerDeath('dev', config.httpHost, config.httpPort, err)
  }
}
