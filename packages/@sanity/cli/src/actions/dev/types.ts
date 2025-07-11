import {type SanityClient} from '@sanity/client'

import {type DevCommand} from '../../commands/dev.js'
import {type CliConfig} from '../../config/cli/types.js'
import {type GlobalCliClientOptions} from '../../core/apiClient.js'
import {type Output} from '../../types.js'

export type DevFlags = DevCommand['flags']

export interface DevActionOptions {
  apiClient: (args: GlobalCliClientOptions) => Promise<SanityClient>
  cliConfig: CliConfig
  flags: DevFlags
  isApp: boolean
  output: Output
  workDir: string
}
