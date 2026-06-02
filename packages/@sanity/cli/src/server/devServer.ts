import {
  extendViteConfigWithUserConfig,
  getViteConfig,
  writeSanityRuntime,
} from '@sanity/cli-build/_internal/build'
import {CliConfig, getCliTelemetry, type UserViteConfig} from '@sanity/cli-core'
import {type ViewArtifact} from '@sanity/federation/vite'
import {type PluginOptions as ReactCompilerConfig} from 'babel-plugin-react-compiler'
import {type FSWatcher} from 'chokidar'
import {createServer, type InlineConfig, type ViteDevServer} from 'vite'

import {
  getAppEnvironmentVariables,
  getStudioEnvironmentVariables,
} from '../actions/build/getEnvironmentVariables.js'
import {serverDebug} from './serverDebug.js'
import {sanityTypegenPlugin} from './vite/plugin-typegen.js'

const debug = serverDebug.extend('dev')

export interface DevServerOptions {
  basePath: string
  cwd: string
  httpPort: number

  reactCompiler: ReactCompilerConfig | undefined
  reactStrictMode: boolean

  staticPath: string

  appTitle?: string
  entry?: string
  httpHost?: string
  isApp?: boolean
  isWorkbench?: boolean
  projectName?: string
  schemaExtraction?: CliConfig['schemaExtraction']
  typegen?: CliConfig['typegen']
  views?: readonly ViewArtifact[]
  vite?: UserViteConfig
}

interface DevServer {
  close(): Promise<void>
  server: ViteDevServer

  watcher?: FSWatcher
}

export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const {
    appTitle,
    basePath,
    cwd,
    entry,
    httpHost,
    httpPort,
    isApp,
    isWorkbench,
    reactCompiler,
    reactStrictMode,
    schemaExtraction,
    typegen,
    views,
    vite: extendViteConfig,
  } = options

  debug('Writing Sanity runtime files')
  const {entries, watcher} = await writeSanityRuntime({
    appTitle,
    basePath,
    cwd,
    entry,
    isApp,
    reactStrictMode,
    watch: true,
  })

  debug('Resolving vite config')
  const mode = 'development'

  function getEnvironmentVariables() {
    return isApp
      ? getAppEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'})
      : getStudioEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'})
  }

  let viteConfig: InlineConfig = await getViteConfig({
    additionalPlugins: [
      // Add typegen when enabled
      ...(typegen?.enabled
        ? [
            sanityTypegenPlugin({
              config: typegen,
              telemetryLogger: getCliTelemetry(),
              workDir: cwd,
            }),
          ]
        : []),
    ],
    basePath,
    cwd,
    entries,
    getEnvironmentVariables,
    isApp,
    isWorkbench,
    mode: 'development',
    reactCompiler,
    schemaExtraction,
    server: {host: httpHost, port: httpPort},
    views,
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

  return {
    close: async () => {
      if (watcher) {
        await watcher.close()
      }
      await server.close()
    },
    server,
    watcher,
  }
}
