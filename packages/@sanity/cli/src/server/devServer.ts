import path from 'node:path'

import {
  extendViteConfigWithUserConfig,
  getViteConfig,
  writeSanityRuntime,
} from '@sanity/cli-build/_internal/build'
import {
  getAppEnvironmentVariables,
  getStudioEnvironmentVariables,
} from '@sanity/cli-build/_internal/env'
import {CliConfig, getCliTelemetry, type UserViteConfig} from '@sanity/cli-core'
import {type WorkbenchExposes} from '@sanity/workbench-cli/build'
import {type PluginOptions as ReactCompilerConfig} from 'babel-plugin-react-compiler'
import {type FSWatcher} from 'chokidar'
import {createServer, type InlineConfig, type ViteDevServer} from 'vite'

import {serverDebug} from './serverDebug.js'
import {sanityTypegenPlugin} from './vite/plugin-typegen.js'

const debug = serverDebug.extend('dev')

export interface DevServerOptions {
  basePath: string
  cwd: string
  httpPort: number

  reactCompiler: boolean | ReactCompilerConfig | undefined
  reactStrictMode: boolean | undefined

  staticPath: string

  appTitle?: string
  /** Enable Vite's experimental bundled dev mode (`experimental.bundledDev`). */
  bundledDev?: boolean
  entry?: string
  exposes?: WorkbenchExposes
  httpHost?: string
  isApp?: boolean
  isWorkbenchApp?: boolean
  projectName?: string
  schemaExtraction?: CliConfig['schemaExtraction']
  typegen?: CliConfig['typegen']
  vite?: UserViteConfig
  /** The workbench app's bus identity (`__SANITY_APP_ID__`). */
  workbenchAppId?: string
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
    bundledDev,
    cwd,
    entry,
    exposes,
    httpHost,
    httpPort,
    isApp,
    isWorkbenchApp,
    reactCompiler,
    reactStrictMode,
    schemaExtraction,
    typegen,
    vite: extendViteConfig,
    workbenchAppId,
  } = options

  debug('Writing Sanity runtime files')
  const {entries, watcher} = await writeSanityRuntime({
    appTitle,
    basePath,
    cwd,
    entry,
    isApp,
    isWorkbenchApp,
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
    exposes,
    getEnvironmentVariables,
    isApp,
    isWorkbenchApp,
    mode: 'development',
    reactCompiler,
    schemaExtraction,
    server: {host: httpHost, port: httpPort},
    workbenchAppId,
  })

  // Opt into Vite's experimental bundled dev mode. Set before the user-config
  // extension below so a `vite` override in sanity.cli.ts still has final say.
  //
  // Bundled mode bundles the app up front from an HTML entry, defaulting to
  // `<root>/index.html`. Sanity has no such file — it serves a virtual document
  // rewritten to `.sanity/runtime/index.html` — so point the bundler at the real
  // runtime HTML, otherwise the build fails with UNRESOLVED_ENTRY.
  //
  // Also force `strictExecutionOrder` so shared chunks cannot evaluate before the
  // entry chunk's react-refresh preamble (which otherwise throws
  // "@vitejs/plugin-react can't detect preamble").
  // See https://github.com/vitejs/vite-plugin-react/issues/1191
  if (bundledDev) {
    const existingRolldown = viteConfig.build?.rolldownOptions
    const existingOutput = existingRolldown?.output
    viteConfig = {
      ...viteConfig,
      build: {
        ...viteConfig.build,
        rolldownOptions: {
          ...existingRolldown,
          input: path.join(cwd, '.sanity', 'runtime', 'index.html'),
          output: Array.isArray(existingOutput)
            ? existingOutput.map((entry) => ({...entry, strictExecutionOrder: true}))
            : {...existingOutput, strictExecutionOrder: true},
        },
      },
      experimental: {...viteConfig.experimental, bundledDev: true},
    }
  }

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
