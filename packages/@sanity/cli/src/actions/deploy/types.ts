import {type CliConfig, type Output} from '@sanity/cli-core'

import {DeployCommand} from '../../commands/deploy.js'

export type DeployFlags = DeployCommand['flags']

export interface DeployAppOptions {
  cliConfig: CliConfig
  flags: DeployFlags
  output: Output
  sourceDir: string
  workDir: string
}
