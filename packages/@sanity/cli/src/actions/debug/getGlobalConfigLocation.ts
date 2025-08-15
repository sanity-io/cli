import {getUserConfig} from '@sanity/cli-core'

export function getGlobalConfigLocation(): string {
  const config = getUserConfig()

  return config.path
}
