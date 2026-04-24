import {type SanityOrgUser, subdebug} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {type DatasetAclMode} from '@sanity/client'

import {createDataset as createDatasetService} from '../../../services/datasets.js'
import {listOrganizations} from '../../../services/organizations.js'
import {createProject} from '../../../services/projects.js'
import {promptUserForOrganization} from './promptUserForOrganization.js'

const debug = subdebug('init')

export async function createProjectFromName({
  coupon,
  createProjectName,
  dataset,
  organization,
  planId,
  user,
  visibility,
}: {
  coupon: string | undefined
  createProjectName: string
  dataset: string | undefined
  organization: string | undefined
  planId: string | undefined
  user: SanityOrgUser
  visibility: 'private' | 'public' | undefined
}): Promise<string> {
  debug('--project-name specified, creating a new project')

  let orgForCreateProjectFlag = organization

  if (!orgForCreateProjectFlag) {
    debug('no organization specified, selecting one')
    const organizations = await listOrganizations()
    orgForCreateProjectFlag = await promptUserForOrganization({
      organizations,
      user,
    })
  }

  debug('creating a new project')
  const createdProject = await createProject({
    displayName: createProjectName.trim(),
    metadata: {coupon},
    organizationId: orgForCreateProjectFlag,
    subscription: planId ? {planId} : undefined,
  })

  debug('Project with ID %s created', createdProject.projectId)
  if (dataset) {
    debug('--dataset specified, creating dataset (%s)', dataset)
    const spin = spinner('Creating dataset').start()
    await createDatasetService({
      aclMode: visibility as DatasetAclMode | undefined,
      datasetName: dataset,
      projectId: createdProject.projectId,
    })
    spin.succeed()
  }

  return createdProject.projectId
}
