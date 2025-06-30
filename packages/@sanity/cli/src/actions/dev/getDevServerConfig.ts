import path from 'node:path'

import {type CliConfig} from '../../config/cli/types.js'
import {spinner} from '../../core/spinner.js'
import {type DevServerOptions} from '../../server/devServer.js'
import {type Output} from '../../types.js'
import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
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

  const env = process.env
  const reactStrictMode = env.SANITY_STUDIO_REACT_STRICT_MODE
    ? env.SANITY_STUDIO_REACT_STRICT_MODE === 'true'
    : Boolean(cliConfig?.reactStrictMode)

  if (env.SANITY_STUDIO_BASEPATH && cliConfig?.project?.basePath) {
    output.warn(
      `Overriding configured base path (${cliConfig.project.basePath}) with value from environment variable (${env.SANITY_STUDIO_BASEPATH})`,
    )
  }

  return {
    ...baseConfig,
    reactCompiler: cliConfig && 'reactCompiler' in cliConfig ? cliConfig.reactCompiler : undefined,
    reactStrictMode,
    staticPath: path.join(workDir, 'static'),
  }
}
