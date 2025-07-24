import {type CliConfig, type Output} from '@sanity/cli-core'

import {BuildCommand} from '../../commands/build.js'
import {type DeployFlags} from '../deploy/types.js'

export type BuildFlags = BuildCommand['flags']

export interface BuildOptions {
  autoUpdatesEnabled: boolean
  cliConfig: CliConfig
  exit: (code?: number) => void
  flags: BuildFlags | DeployFlags
  output: Output

  workDir: string

  outDir?: string
}
