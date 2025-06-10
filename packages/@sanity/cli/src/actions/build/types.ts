import type {Command} from '@oclif/core'
import {BuildCommand} from '../../commands/build.js'
import type {CliConfig} from '../../config/cli/types.js'

export type BuildFlags = BuildCommand['flags']

export interface BuildOptions {
  autoUpdatesEnabled: boolean
  cliConfig: CliConfig
  flags: BuildFlags
  output: {
    error: Command['error']
    log: Command['log']
    warn: Command['warn']
  }
  workDir: string

  outDir?: string
}
