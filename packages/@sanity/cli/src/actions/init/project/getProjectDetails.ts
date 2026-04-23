import {type SanityOrgUser, subdebug, type TelemetryUserProperties} from '@sanity/cli-core'
import {type TelemetryTrace} from '@sanity/telemetry'

import {listOrganizations, type ProjectOrganization} from '../../../services/organizations.js'
import {type InitStepResult} from '../../../telemetry/init.telemetry.js'
import {InitError} from '../initError.js'
import {type InitContext} from '../types.js'
import {getOrCreateDataset} from './getOrCreateDataset.js'
import {getOrCreateProject} from './getOrCreateProject.js'
import {promptForAppTemplateSetup} from './promptForAppTemplateSetup.js'
import {promptUserForOrganization} from './promptUserForOrganization.js'

const debug = subdebug('init')

export async function getProjectDetails({
  coupon,
  dataset,
  datasetDefault,
  isAppTemplate,
  newProject,
  organization,
  output,
  planId,
  project,
  showDefaultConfigPrompt,
  trace,
  unattended,
  user,
  visibility,
}: {
  coupon: string | undefined
  dataset: string | undefined
  datasetDefault: boolean
  isAppTemplate: boolean
  newProject: string | undefined
  organization: string | undefined
  output: InitContext['output']
  planId: string | undefined
  project: string | undefined
  showDefaultConfigPrompt: boolean
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  unattended: boolean
  user: SanityOrgUser
  visibility: 'private' | 'public' | undefined
}): Promise<{
  datasetName: string
  displayName: string
  isFirstProject: boolean
  organizationId?: string
  projectId: string
  schemaUrl?: string
}> {
  if (isAppTemplate) {
    let appOrganizationId: string | undefined = organization
    if (!appOrganizationId) {
      let organizations: ProjectOrganization[]
      try {
        organizations = await listOrganizations()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        throw new InitError(`Failed to communicate with the Sanity API:\n${message}`, 1)
      }
      appOrganizationId = await promptUserForOrganization({
        isAppTemplate: true,
        organizations,
        user,
      })
    }

    const {
      datasetName: appDatasetName,
      displayName: appDisplayName,
      projectId: appProjectId,
    } = await promptForAppTemplateSetup({
      coupon,
      dataset,
      datasetDefault,
      newProject,
      organization,
      organizationId: appOrganizationId,
      output,
      planId,
      project,
      trace,
      unattended,
      user,
      visibility,
    })

    return {
      datasetName: appDatasetName,
      displayName: appDisplayName,
      isFirstProject: false,
      organizationId: appOrganizationId,
      projectId: appProjectId,
    }
  }

  debug('Prompting user to select or create a project')
  const projectResult = await getOrCreateProject({
    coupon,
    newProject,
    organization,
    planId,
    project,
    unattended,
    user,
  })
  debug(`Project with name ${projectResult.displayName} selected`)

  debug('Prompting user to select or create a dataset')
  const datasetResult = await getOrCreateDataset({
    dataset,
    defaultConfig: datasetDefault || undefined,
    displayName: projectResult.displayName,
    output,
    projectId: projectResult.projectId,
    showDefaultConfigPrompt,
    unattended,
    visibility,
  })
  debug(`Dataset with name ${datasetResult.datasetName} selected`)

  trace.log({
    datasetName: datasetResult.datasetName,
    selectedOption: datasetResult.userAction,
    step: 'createOrSelectDataset',
    visibility,
  })

  return {
    datasetName: datasetResult.datasetName,
    displayName: projectResult.displayName,
    isFirstProject: projectResult.isFirstProject,
    projectId: projectResult.projectId,
  }
}
