import {BuildCommand} from '../../commands/build.js'
import {type CliConfig} from '../../config/cli/types.js'
import {type Output} from '../../types.js'
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
