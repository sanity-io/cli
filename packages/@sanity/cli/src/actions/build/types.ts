import {BuildCommand} from '../../commands/build.js'
import {type CliConfig} from '../../config/cli/types.js'
import {type Output} from '../../types.js'

export type BuildFlags = BuildCommand['flags']

export interface BuildOptions {
  autoUpdatesEnabled: boolean
  cliConfig: CliConfig
  flags: BuildFlags
  output: Output
  workDir: string

  outDir?: string
}
