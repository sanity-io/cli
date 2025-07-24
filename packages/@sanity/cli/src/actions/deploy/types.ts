import {DeployCommand} from '../../commands/deploy.js'
import {type CliConfig} from '../../config/cli/types.js'
import {type Output} from '../../types.js'

export type DeployFlags = DeployCommand['flags']

export interface DeployAppOptions {
  cliConfig: CliConfig
  exit: (code?: number) => void
  flags: DeployFlags
  output: Output
  sourceDir: string
  workDir: string
}
