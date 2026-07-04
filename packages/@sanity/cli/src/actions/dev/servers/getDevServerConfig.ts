import path from 'node:path'

import {type CliConfig, getSanityEnvVar, type Output} from '@sanity/cli-core'
import {logSymbols, spinner} from '@sanity/cli-core/ux'
import {isWorkbenchApp} from '@sanity/workbench-cli'

import {type DevServerOptions} from '../../../server/devServer.js'
import {determineIsApp} from '../../../util/determineIsApp.js'
import {getSharedServerConfig} from '../../../util/getSharedServerConfig.js'
import {resolveReactStrictMode} from '../../../util/resolveReactStrictMode.js'
import {type DevFlags} from '../types.js'

export function getDevServerConfig({
  cliConfig,
  flags,
  httpPort,
  output,
  workDir,
}: {
  cliConfig?: CliConfig
  flags: DevFlags
  httpPort?: number
  output: Output
  workDir: string
}): Omit<DevServerOptions, 'spinner'> {
  const configSpinner = spinner('Checking configuration files...')

  const baseConfig = getSharedServerConfig({
    cliConfig,
    flags: {
      host: flags.host,
      port: flags.port,
    },
    workDir,
  })

  configSpinner.succeed()

  const isApp = cliConfig ? determineIsApp(cliConfig) : false
  const reactStrictMode = resolveReactStrictMode(cliConfig)
  // `views`/`services` are declared via `unstable_defineApp`, so read them off
  // the branded app result rather than the legacy `app` config type.
  const app = cliConfig?.app

  const envBasePath = getSanityEnvVar('BASEPATH', isApp ?? false)
  if (envBasePath && cliConfig?.project?.basePath) {
    output.warn(
      `Overriding configured base path (${cliConfig.project.basePath}) with value from environment variable (${envBasePath})`,
    )
  }

  // Unstable opt-in to Vite's experimental bundled dev mode, via
  // `unstable_bundledDev` in sanity.cli.ts. Defaults to off.
  const bundledDev = cliConfig?.unstable_bundledDev ?? false
  if (bundledDev) {
    output.log(`${logSymbols.info} Running dev server with experimental Vite bundled dev mode`)
  }

  return {
    ...baseConfig,
    bundledDev,
    // The app's navigable entry. A branded app that omits `entry` has no app
    // view: the runtime/federation skip the `./App` render path entirely.
    entry: app?.entry,
    exposes: isWorkbenchApp(app) ? {services: app.services, views: app.views} : undefined,
    // `devAction` passes an explicit port when a running workbench claimed the
    // configured one; otherwise the shared resolution stands.
    httpPort: httpPort ?? baseConfig.httpPort,
    isWorkbenchApp: isWorkbenchApp(app),
    reactCompiler: cliConfig && 'reactCompiler' in cliConfig ? cliConfig.reactCompiler : undefined,
    reactStrictMode,
    staticPath: path.join(workDir, 'static'),
    typegen: cliConfig?.typegen,
  }
}
