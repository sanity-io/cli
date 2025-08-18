interface TokenRole {
  name: string
  title: string
}

export interface TokenResponse {
  id: string
  key: string
  label: string
  projectUserId: string
  roles: TokenRole[]
}

export interface ProjectRole {
  appliesToRobots: boolean
  appliesToUsers: boolean
  description: string
  isCustom: boolean
  name: string
  projectId: string
  title: string
}

export interface Token {
  createdAt: string
  createdBy: string
  id: string
  label: string
  lastUsedAt: string | null
  permissions: string[]
  projectId: string
  projectUserId: string
  roles: TokenRole[]
}
