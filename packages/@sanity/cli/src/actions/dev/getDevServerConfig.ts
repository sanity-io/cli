import path from 'node:path'

import {type CliConfig, getSanityEnvVar, isWorkbenchApp, type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {type DevServerOptions} from '../../server/devServer.js'
import {determineIsApp} from '../../util/determineIsApp.js'
import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
import {resolveReactStrictMode} from '../../util/resolveReactStrictMode.js'
import {type DevFlags} from './types.js'

export function getDevServerConfig({
  cliConfig,
  flags,
  output,
  workDir,
}: {
  cliConfig?: CliConfig
  flags: DevFlags
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
  // `views` is declared via `unstable_defineApp`, so read it off the branded
  // app result rather than the legacy `app` config type.
  const app = cliConfig?.app

  const envBasePath = getSanityEnvVar('BASEPATH', isApp ?? false)
  if (envBasePath && cliConfig?.project?.basePath) {
    output.warn(
      `Overriding configured base path (${cliConfig.project.basePath}) with value from environment variable (${envBasePath})`,
    )
  }

  return {
    ...baseConfig,
    isWorkbenchApp: isWorkbenchApp(app),
    reactCompiler: cliConfig && 'reactCompiler' in cliConfig ? cliConfig.reactCompiler : undefined,
    reactStrictMode,
    staticPath: path.join(workDir, 'static'),
    typegen: cliConfig?.typegen,
    views: isWorkbenchApp(app) ? app.views : undefined,
  }
}
