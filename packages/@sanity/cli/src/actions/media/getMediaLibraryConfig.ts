import {type CliConfig} from '@sanity/cli-core'

export function getMediaLibraryConfig(cliConfig: CliConfig): CliConfig['mediaLibrary'] {
  return cliConfig?.mediaLibrary
}
