interface TokenRole {
  name: string
  title: string
}

/**
 * A robot as returned by the Access API
 * (`/access/project/{projectId}/robots`)
 *
 * @internal
 */
export interface Robot {
  createdAt: string
  expiresAt: string | null
  id: string
  label: string
  memberships: RobotMembership[]
  tokenId: string

  managedBy?: {
    resourceId: string
    resourceType: string
  } | null
}

interface RobotMembership {
  resourceId: string
  resourceType: string
  roleNames: string[]

  addedAt?: string
  lastSeenAt?: string | null
  resourceUserId?: string | null
}

/**
 * A project API token, mapped from an Access API robot.
 *
 * `id` is the robot ID used by the Access API for delete/update operations,
 * while `tokenId` is the identifier of the current token credential (the ID
 * previously exposed by the deprecated Projects API tokens endpoints).
 *
 * @internal
 */
export interface Token {
  createdAt: string
  expiresAt: string | null
  id: string
  label: string
  roles: TokenRole[]
  tokenId: string
}

export interface TokenResponse extends Token {
  key: string
}

export interface ProjectRole {
  appliesToRobots: boolean
  appliesToUsers: boolean
  description: string
  isCustom: boolean
  name: string
  title: string
}
