import {type CliConfig, type GlobalCliClientOptions, type Output} from '@sanity/cli-core'
import {type SanityClient} from '@sanity/client'

import {type DevCommand} from '../../commands/dev.js'

export type DevFlags = DevCommand['flags']

export interface DevActionOptions {
  apiClient: (args: GlobalCliClientOptions) => Promise<SanityClient>
  cliConfig: CliConfig
  flags: DevFlags
  isApp: boolean
  output: Output
  workDir: string
}
