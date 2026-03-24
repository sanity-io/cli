import {type CliConfig, type Output} from '@sanity/cli-core'

import {type DevCommand} from '../../commands/dev.js'

export type DevFlags = DevCommand['flags']

export interface DevActionOptions {
  cliConfig: CliConfig
  flags: DevFlags
  isApp: boolean
  output: Output
  workDir: string

  workbenchAvailable?: boolean
}
