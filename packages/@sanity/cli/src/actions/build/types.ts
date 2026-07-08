import {type CliConfig, type Output} from '@sanity/cli-core'
import {type DeployFlags} from '@sanity/cli-core/deploy'

import {BuildCommand} from '../../commands/build.js'

export type BuildFlags = BuildCommand['flags']

export interface BuildOptions {
  autoUpdatesEnabled: boolean
  cliConfig: CliConfig
  flags: BuildFlags | DeployFlags
  output: Output

  workDir: string

  calledFromDeploy?: boolean
  outDir?: string
}
