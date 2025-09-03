export const PACKAGE_NAME = 'newCli'
export const MAX_DISCOVERY_DEPTH = 4
export const CLI_COMMANDS_TYPE = 'cliCommands'

export const QUERIES = {
  EXISTING_COMMANDS: `*[_type == $type && name == $name && version == $version][0]`,
} as const

export const SANITY_CONFIG = {
  apiVersion: '2025-01-01',
  dataset: 'production',
  projectId: 'jbvzi6yv',
  useCdn: false,
} as const
