import {spinner} from '../../core/spinner.js'
import {startDevServer} from '../../server/devServer.js'
import {gracefulServerDeath} from '../../server/gracefulServerDeath.js'
import {getDevServerConfig} from './getDevServerConfig.js'
import {type DevActionOptions} from './types.js'

export async function startStudioDevServer(options: DevActionOptions): Promise<void> {
  const {cliConfig, flags, output, workDir} = options

  const config = getDevServerConfig({cliConfig, flags, output, workDir})

  try {
    const spin = spinner('Starting dev server').start()
    await startDevServer({...config, skipStartLog: false, spinner: spin})
  } catch (err) {
    gracefulServerDeath('dev', config.httpHost, config.httpPort, err)
  }
}
