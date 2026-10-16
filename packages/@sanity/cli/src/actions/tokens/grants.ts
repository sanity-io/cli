import {type Membership, type SelectedTokenRole} from './types.js'

type OrgRole = {key: string; roleName: string; title: string}

export type OrgPermission = {key: string; title: string} & ({roleName: string} | {roles: OrgRole[]})

export type Grant = {key: string; roles: string[]}

export const DEFAULT_ROLE = {
  name: 'viewer',
  title: 'Viewer',
} satisfies SelectedTokenRole

const PROJECT_PREFIX = 'project:'

const viewer = (roleName: string): OrgRole => ({
  key: 'viewer',
  roleName,
  title: 'Viewer',
})
const editor = (roleName: string): OrgRole => ({
  key: 'editor',
  roleName,
  title: 'Editor',
})

export const ORG_PERMISSIONS: OrgPermission[] = [
  {
    key: 'context',
    roles: [
      viewer('knowledge-base-viewer-robot'),
      editor('knowledge-base-editor-robot'),
      {
        key: 'developer',
        roleName: 'knowledge-base-developer-robot',
        title: 'Developer',
      },
    ],
    title: 'Context',
  },
  {
    key: 'blueprints',
    roleName: 'blueprints-deployer-robot',
    title: 'Blueprints',
  },
  {
    key: 'media-library',
    roles: [viewer('media-library-viewer-robot'), editor('media-library-editor-robot')],
    title: 'Media Library',
  },
  {
    key: 'canvas',
    roles: [viewer('canvas-viewer-robot'), editor('canvas-editor-robot')],
    title: 'Canvas',
  },
  {
    key: 'sdk-apps',
    roleName: 'sdk-app-editor-robot',
    title: 'Manage SDK Apps',
  },
  {
    key: 'access',
    roles: [viewer('access-viewer-robot'), editor('access-manager-robot')],
    title: 'Manage Access',
  },
  {
    key: 'deploy-studios',
    roleName: 'deploy-studio-robot',
    title: 'Deploy Studios (all projects)',
  },
]

const findOrgPermission = (key: string) =>
  ORG_PERMISSIONS.find((permission) => permission.key === key)

const isProjectGrant = (grant: Grant) => grant.key.startsWith(PROJECT_PREFIX)

export function projectGrantKey(projectId: string): string {
  return `${PROJECT_PREFIX}${projectId}`
}

export function parseGrant(value: string): {error: string} | {grant: Grant} {
  const [key = '', roleList, ...extra] = value.split('=')
  const roles = roleList?.split(',') ?? []
  if (extra.length > 0 || roles.includes('')) {
    return {
      error: `Invalid grant "${value}". Use <permission>[=<role>] or project:<projectId>[=<role>[,<role>]]`,
    }
  }
  const grant = {key, roles: roles.length > 0 ? roles : [DEFAULT_ROLE.name]}

  if (key.startsWith(PROJECT_PREFIX) && key.length > PROJECT_PREFIX.length) {
    return {grant}
  }

  const permission = findOrgPermission(key)
  if (!permission) {
    const keys = [...ORG_PERMISSIONS.map((p) => p.key), `${PROJECT_PREFIX}<projectId>`]
    return {error: `Unknown grant "${key}". Use one of: ${keys.join(', ')}`}
  }

  if ('roleName' in permission) {
    return roles.length > 0
      ? {
          error: `Grant "${key}" does not take a role. Pass it as --grant ${key}`,
        }
      : {grant: {key, roles: []}}
  }

  const roleKeys = permission.roles.map((role) => role.key)
  const invalid = roles.find((role) => !roleKeys.includes(role))
  if (invalid) {
    return {
      error: `Invalid role "${invalid}" for "${key}". Use one of: ${roleKeys.join(', ')}`,
    }
  }

  return {grant}
}

export function formatGrant({key, roles}: Grant): string {
  return roles.length > 0 ? `${key}=${roles.join(',')}` : key
}

function toOrganizationRoleNames(grants: Grant[]): string[] {
  const roleNames = grants
    .filter((grant) => !isProjectGrant(grant))
    .flatMap(({key, roles}) => {
      const permission = findOrgPermission(key)
      if (!permission) return []
      if ('roleName' in permission) return [permission.roleName]
      return permission.roles
        .filter((role) => roles.includes(role.key))
        .map((role) => role.roleName)
    })
  return [...new Set(roleNames)]
}

function toProjectMemberships(grants: Grant[]): Membership[] {
  const rolesByProject = new Map<string, Set<string>>()
  for (const grant of grants.filter((grant) => isProjectGrant(grant))) {
    const projectId = grant.key.slice(PROJECT_PREFIX.length)
    rolesByProject.set(
      projectId,
      new Set([...(rolesByProject.get(projectId) ?? []), ...grant.roles]),
    )
  }

  return [...rolesByProject].map(([resourceId, roleNames]) => ({
    resourceId,
    resourceType: 'project',
    roleNames: [...roleNames],
  }))
}

export function getProjectTokenMembership(grants: Grant[]): Membership | undefined {
  const [membership, ...otherProjects] = toProjectMemberships(grants)
  return otherProjects.length === 0 && toOrganizationRoleNames(grants).length === 0
    ? membership
    : undefined
}

export function toMemberships(grants: Grant[], organizationId: string): Membership[] {
  const roleNames = toOrganizationRoleNames(grants)
  const projectMemberships = toProjectMemberships(grants)
  return roleNames.length > 0
    ? [{resourceId: organizationId, resourceType: 'organization', roleNames}, ...projectMemberships]
    : projectMemberships
}
