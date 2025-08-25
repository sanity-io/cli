import {type ReactCompilerConfig, type UserViteConfig} from '@sanity/cli-core'
import {createServer, type InlineConfig, type ViteDevServer} from 'vite'

import {extendViteConfigWithUserConfig, getViteConfig} from '../actions/build/getViteConfig.js'
import {writeSanityRuntime} from '../actions/build/writeSanityRuntime.js'
import {serverDebug} from './serverDebug.js'

const debug = serverDebug.extend('dev')

export interface DevServerOptions {
  basePath: string
  cwd: string
  httpPort: number

  reactCompiler: ReactCompilerConfig | undefined
  reactStrictMode: boolean

  staticPath: string

  entry?: string
  httpHost?: string
  isApp?: boolean
  projectName?: string
  vite?: UserViteConfig
}

interface DevServer {
  close(): Promise<void>
  server: ViteDevServer
}

export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const {
    basePath,
    cwd,
    entry,
    httpHost,
    httpPort,
    isApp,
    reactCompiler,
    reactStrictMode,
    vite: extendViteConfig,
  } = options

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
  const server = await createServer(viteConfig)

  debug('Listening on specified port')
  await server.listen()

  return {close: () => server.close(), server}
}
