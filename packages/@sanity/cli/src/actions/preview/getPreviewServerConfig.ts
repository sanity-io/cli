import {type CliConfig} from '@sanity/cli-core'

import {
  getSharedServerConfig,
  type GetSharedServerConfigResult,
} from '../../util/getSharedServerConfig.js'
import {type ServerFlags} from './types.js'

interface GetPreviewServerConfigOptions {
  flags: ServerFlags
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
