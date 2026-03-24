import fs from 'node:fs'
import path from 'node:path'

import {startDevServer} from '../../server/devServer.js'
import {gracefulServerDeath} from '../../server/gracefulServerDeath.js'
import {devDebug} from './devDebug.js'
import {getDevServerConfig} from './getDevServerConfig.js'
import {type DevActionOptions} from './types.js'

export async function startWorkbenchDevServer(
  options: DevActionOptions,
): Promise<{close?: () => Promise<void>; port?: number}> {
  const {cliConfig, flags, output, workDir} = options

  const config = getDevServerConfig({cliConfig, flags, output, workDir})
  const workbenchWorkDir = path.join(workDir, 'workbench')

  if (!fs.existsSync(workbenchWorkDir)) {
    return {}
  }

  try {
    output.log('Starting workbench dev server')

    const {close, server} = await startDevServer({
      ...config,
      cwd: workbenchWorkDir,
    })

    output.log(`Workbench dev server started on port ${server.config.server.port}`)

    return {close, port: server.config.server.port}
  } catch (err) {
    devDebug('Error starting workbench dev server', err)
    throw gracefulServerDeath('dev', config.httpHost, config.httpPort, err)
  }
}
