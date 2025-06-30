import {type DevCommand} from '../../commands/dev.js'
import {type CliConfig} from '../../config/cli/types.js'
import {type Output} from '../../types.js'

export type DevFlags = DevCommand['flags']

export interface DevActionOptions {
  cliConfig: CliConfig
  flags: DevFlags
  output: Output
  workDir: string
}
