import {determineIsApp} from '../../util/determineIsApp.js'
import {startAppDevServer} from './startAppDevServer.js'
import {startStudioDevServer} from './startStudioDevServer.js'
import {type DevActionOptions} from './types.js'

export async function devAction(options: DevActionOptions): Promise<void> {
  const {cliConfig} = options
  const isApp = determineIsApp(cliConfig)

  await (isApp ? startAppDevServer(options) : startStudioDevServer(options))
}
