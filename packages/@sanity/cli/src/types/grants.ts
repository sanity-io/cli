export interface RequiredPermission {
  /** The grant type, e.g. 'read', 'create', 'update', 'delete' */
  grant: string
  /** The permission scope, e.g. 'sanity.project.datasets' */
  permission: string
}

interface GrantResource {
  grants: Array<{name: string; params: Record<string, unknown>}>
}

export interface UserGrantsResponse {
  organizations: Record<string, Record<string, GrantResource[]>>
  projects: Record<string, Record<string, GrantResource[]>>
}
