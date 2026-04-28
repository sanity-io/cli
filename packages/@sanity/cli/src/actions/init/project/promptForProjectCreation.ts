import {type SanityOrgUser} from '@sanity/cli-core'
import {input} from '@sanity/cli-core/ux'

import {type ProjectOrganization} from '../../../services/organizations.js'
import {createProject} from '../../../services/projects.js'
import {promptUserForOrganization} from './promptUserForOrganization.js'

export async function promptForProjectCreation({
  coupon,
  isUsersFirstProject,
  organizationId,
  organizations,
  planId,
  user,
}: {
  coupon: string | undefined
  isUsersFirstProject: boolean
  organizationId: string | undefined
  organizations: ProjectOrganization[]
  planId: string | undefined
  user: SanityOrgUser
}) {
  const projectName = await input({
    default: 'My Sanity Project',
    message: 'Project name:',
    validate(val) {
      if (!val || val.trim() === '') {
        return 'Project name cannot be empty'
      }

      if (val.length > 80) {
        return 'Project name cannot be longer than 80 characters'
      }

      return true
    },
  })

  const org = organizationId || (await promptUserForOrganization({organizations, user}))

  const newProjectResult = await createProject({
    displayName: projectName,
    metadata: {coupon},
    organizationId: org,
    subscription: planId ? {planId} : undefined,
  })

  return {
    ...newProjectResult,
    isFirstProject: isUsersFirstProject,
    organizationId: org,
    userAction: 'create' as const,
  }
}
