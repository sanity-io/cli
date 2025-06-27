import {type CliConfig} from '../../config/cli/types.js'
import {
  getSharedServerConfig,
  type GetSharedServerConfigResult,
} from '../../util/getSharedServerConfig.js'
import {type StartFlags} from './types.js'

interface GetPreviewServerConfigOptions {
  flags: StartFlags
  rootDir: string
  workDir: string

  cliConfig?: CliConfig
}

interface GetPreviewServerConfigResult extends GetSharedServerConfigResult {
  root: string
  workDir: string
}

export function getPreviewServerConfig(
  options: GetPreviewServerConfigOptions,
): GetPreviewServerConfigResult {
  const {cliConfig, flags, rootDir, workDir} = options
  const baseConfig = getSharedServerConfig({cliConfig, flags, workDir})

  return {
    ...baseConfig,
    root: rootDir,
    workDir,
  }
}
