import {type CliConfig, type ProjectRootResult} from '@sanity/cli-core'

import {type ModuleVersionResult} from '../versions/types.js'

export interface DebugInfoOptions {
  cliConfig: CliConfig | undefined
  includeSecrets: boolean
  projectRoot: ProjectRootResult | undefined
}

export interface UserInfo {
  email: string
  id: string
  name: string
}

export interface ProjectInfo {
  displayName: string
  id: string
  userRoles: string[]
}

export interface AuthInfo {
  authToken: string
  hasToken: boolean
  userType: string
}

export interface DebugInfo {
  auth: AuthInfo
  globalConfig: Record<string, unknown>
  project: Error | ProjectInfo | null
  projectConfig: CliConfig | Error | undefined
  user: Error | UserInfo | null
  versions: ModuleVersionResult[] | undefined
}
