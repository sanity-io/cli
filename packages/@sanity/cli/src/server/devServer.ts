import {createRequire} from 'node:module'

import {type ReactCompilerConfig, type UserViteConfig} from '@sanity/cli-core'
import chalk from 'chalk'
import {type Ora} from 'ora'
import {type InlineConfig} from 'vite'

import {extendViteConfigWithUserConfig, getViteConfig} from '../actions/build/getViteConfig.js'
import {writeSanityRuntime} from '../actions/build/writeSanityRuntime.js'
import {serverDebug} from './serverDebug.js'

const debug = serverDebug.extend('dev')
const require = createRequire(import.meta.url)
const {version} = require('vite/package.json')

export interface DevServerOptions {
  basePath: string
  cwd: string
  httpPort: number

  reactCompiler: ReactCompilerConfig | undefined
  reactStrictMode: boolean

  spinner: Ora
  staticPath: string

  entry?: string
  httpHost?: string
  isApp?: boolean
  printStartLog?: boolean
  projectName?: string
  vite?: UserViteConfig
}

interface DevServer {
  close(): Promise<void>
}

export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const {
    basePath,
    cwd,
    entry,
    httpHost,
    httpPort,
    isApp,
    printStartLog,
    reactCompiler,
    reactStrictMode,
    spinner,
    vite: extendViteConfig,
  } = options

  const startTime = Date.now()
  debug('Writing Sanity runtime files')
  await writeSanityRuntime({basePath, cwd, entry, isApp, reactStrictMode, watch: true})

  debug('Resolving vite config')
  const mode = 'development'

  let viteConfig: InlineConfig = await getViteConfig({
    basePath,
    cwd,
    isApp,
    mode: 'development',
    reactCompiler,
    server: {host: httpHost, port: httpPort},
  })

  // Extend Vite configuration with user-provided config
  if (extendViteConfig) {
    viteConfig = await extendViteConfigWithUserConfig(
      {command: 'serve', mode},
      viteConfig,
      extendViteConfig,
    )
  }

  debug('Creating vite server')
  const {createServer} = await import('vite')

  const server = await createServer(viteConfig)

  const info = server.config.logger.info

  debug('Listening on specified port')
  await server.listen()

  // Stop the spinner before logging the startup message
  spinner.succeed()

  if (printStartLog) {
    const startupDuration = Date.now() - startTime
    const url = `http://${httpHost || 'localhost'}:${httpPort || '3333'}${basePath}`
    const appType = isApp ? 'Sanity application' : 'Sanity Studio'

    info(
      `${appType} ` +
        `using ${chalk.cyan(`vite@${version}`)} ` +
        `ready in ${chalk.cyan(`${Math.ceil(startupDuration)}ms`)} ` +
        `and running at ${chalk.cyan(url)}`,
    )
  }
  return {close: () => server.close()}
}
