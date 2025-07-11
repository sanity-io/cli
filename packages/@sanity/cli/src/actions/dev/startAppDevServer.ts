import chalk from 'chalk'

import {spinner} from '../../core/spinner.js'
import {startDevServer} from '../../server/devServer.js'
import {gracefulServerDeath} from '../../server/gracefulServerDeath.js'
import {getCoreAppURL} from './getCoreAppUrl.js'
import {getDevServerConfig} from './getDevServerConfig.js'
import {type DevActionOptions} from './types.js'

export async function startAppDevServer(options: DevActionOptions): Promise<void> {
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
    return
  }

  const config = getDevServerConfig({cliConfig, flags, output, workDir})

  try {
    const spin = spinner('Starting dev server').start()
    await startDevServer({...config, isApp: true, skipStartLog: true, spinner: spin})

    output.log(`Dev server started on port ${config.httpPort}`)
    output.log(`View your app in the Sanity dashboard here:`)
    output.log(
      chalk.blue(
        chalk.underline(
          await getCoreAppURL({
            httpHost: config.httpHost,
            httpPort: config.httpPort,
            organizationId,
          }),
        ),
      ),
    )
  } catch (err) {
    gracefulServerDeath('dev', config.httpHost, config.httpPort, err)
  }
}
