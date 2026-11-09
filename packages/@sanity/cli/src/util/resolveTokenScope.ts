import {type SanityCommandInterface} from '@sanity/cli-core'

import {type TokenScope} from '../actions/tokens/types.js'
import {promptForProject} from '../prompts/promptForProject.js'

export async function resolveTokenScope(options: {
  getProjectId: SanityCommandInterface['getProjectId']
  grant: 'delete' | 'read'
  organization?: string
}): Promise<TokenScope> {
  const {getProjectId, grant, organization} = options
  if (organization) return {resourceId: organization, resourceType: 'organization'}

  const projectId = await getProjectId({
    fallback: () =>
      promptForProject({requiredPermissions: [{grant, permission: 'sanity.project.tokens'}]}),
  })
  return {resourceId: projectId, resourceType: 'project'}
}
