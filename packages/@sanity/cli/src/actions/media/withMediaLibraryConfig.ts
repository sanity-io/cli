import {type CliConfig} from '@sanity/cli-core'

export function withMediaLibraryConfig(cliConfig: CliConfig): CliConfig['mediaLibrary'] {
  return cliConfig?.mediaLibrary
}
