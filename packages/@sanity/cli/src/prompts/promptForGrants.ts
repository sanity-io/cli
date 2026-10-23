import {type ChecklistItem, roleChecklist} from '@sanity/cli-core/ux'

import {
  DEFAULT_ROLE,
  type Grant,
  ORG_PERMISSIONS,
  type OrgPermission,
  projectGrantKey,
} from '../actions/tokens/grants.js'
import {getTokenRoles} from '../services/tokens.js'

type Project = {displayName: string; id: string}

const defaultRole = {title: DEFAULT_ROLE.title, value: DEFAULT_ROLE.name}

function toOrgItem(permission: OrgPermission): ChecklistItem {
  const item = {name: permission.title, value: permission.key}
  if ('roleName' in permission) return item

  return {
    ...item,
    role: defaultRole.value,
    roles: permission.roles.map(({key, title}) => ({title, value: key})),
  }
}

function toProjectItem(project: Project, preselectedProjectId: string | undefined): ChecklistItem {
  return {
    checked: project.id === preselectedProjectId,
    loadRoles: async () => {
      const roles = await getTokenRoles(project.id)
      return roles
        .filter((role) => role.appliesToRobots)
        .map(({name, title}) => ({title, value: name}))
    },
    name: project.displayName,
    role: defaultRole.value,
    roles: [defaultRole],
    suffix: `(${project.id})`,
    value: projectGrantKey(project.id),
  }
}

export async function promptForGrants({
  preselectedProjectId,
  projects,
}: {
  preselectedProjectId: string | undefined
  projects: Project[]
}): Promise<Grant[]> {
  const answers = await roleChecklist({
    message: 'What should this token access?',
    sections: [
      {
        items: ORG_PERMISSIONS.map((permission) => toOrgItem(permission)),
        title: 'Organization',
      },
      {
        items: projects.map((project) => toProjectItem(project, preselectedProjectId)),
        title: 'Projects',
      },
    ],
  })

  return answers.map(({role, value}) => ({
    key: value,
    roles: role ? [role] : [],
  }))
}
