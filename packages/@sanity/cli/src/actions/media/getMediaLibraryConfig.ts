import {type CliConfig} from '@sanity/cli-core/types'

export function getMediaLibraryConfig(cliConfig: CliConfig): CliConfig['mediaLibrary'] {
  return cliConfig?.mediaLibrary
}
