import {type CliConfig, type ProjectRootResult} from '@sanity/cli-core'
import {type SanityClient} from '@sanity/client'

import {type ModuleVersionResult} from '../versions/types.js'

export interface DebugInfoOptions {
  cliConfig: CliConfig
  client: SanityClient
  includeSecrets: boolean
  projectRoot: ProjectRootResult
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

  studioHostname?: string | null
}

export interface ProjectAPIResponse {
  displayName: string
  id: string
  members: {
    id: string
    roles: {name: string}[]
  }[]
  studioHost: string
}

export interface AuthInfo {
  authToken: string
  hasToken: boolean
  userType: string
}

export interface GlobalConfig {
  [key: string]: unknown

  authToken?: string
  telemetryConsent?: {
    updatedAt?: number
    value: {
      status: string
      type: string
    }
  }
}

export interface DebugInfo {
  auth: AuthInfo
  globalConfig: GlobalConfig
  project: Error | ProjectInfo | null
  projectConfig: CliConfig | Error
  user: Error | UserInfo | null
  versions: ModuleVersionResult[]
}
