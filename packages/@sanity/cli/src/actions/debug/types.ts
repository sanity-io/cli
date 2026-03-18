export interface UserInfo {
  email: string
  id: string
  name: string
  provider: string
}

export interface AuthInfo {
  authToken: string
  hasToken: boolean
  userType: string
}

export interface CliInfo {
  installContext: string
  version: string
}

export interface ProjectInfo {
  cliConfigPath: string | undefined
  rootPath: string
  studioConfigPath: string | undefined
}

export interface StudioWorkspace {
  dataset: string
  name: string | undefined
  projectId: string
}

export interface ResolvedWorkspace {
  name: string
  roles: string[]
  title: string
}
