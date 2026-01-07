export interface Invite {
  acceptedByUserId: string | null
  createdAt: string
  email: string
  isAccepted: boolean
  isRevoked: boolean
  role: string
}

export interface User {
  createdAt: string
  displayName: string
  familyName: string | null

  givenName: string | null
  id: string
  imageUrl: string | null
  middleName: string | null

  projectId: string

  provider: string
  updatedAt: string | null
}

export interface Role {
  appliesToRobots: boolean
  appliesToUsers: boolean
  grants: Record<string, Grant[] | undefined>
  isCustom: boolean
  name: string
  projectId: string
  title: string

  description?: string
}

interface Grant {
  grants: unknown[]
  id: string
  isCustom: boolean
  name: string
  title: string

  description?: string
}
