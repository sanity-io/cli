export interface Role {
  appliesToRobots: boolean
  appliesToUsers: boolean
  description: string
  isCustom: boolean
  name: string
  resourceId: string
  resourceType: string
  title: string
}

export type SelectedTokenRole = Pick<Role, 'name' | 'title'>

export interface Membership {
  resourceId: string
  resourceType: string
  roleNames: string[]

  addedAt?: string
  lastSeenAt?: string | null
  resourceUserId?: string | null
}

export interface Robot {
  createdAt: string
  id: string
  label: string
  memberships: Membership[]

  expiresAt?: string | null
  managedBy?: {
    resourceId: string
    resourceType: string
  }
  tokenId?: string
}

export interface RobotWithToken extends Robot {
  token: string
}
