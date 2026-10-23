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
  isMediaLibraryTemplate = false,
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
  isMediaLibraryTemplate?: boolean
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
    const hasProjectFlag = Boolean(project || newProject)
    let appOrganizationId: string | undefined = organization
    // A media-library config is organization-only, so the org is always
    // resolved here — project flags can't stand in for it.
    if (!appOrganizationId && (isMediaLibraryTemplate || !hasProjectFlag)) {
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

    // The media-library config scaffold records only `app.organizationId`, so
    // the project/dataset setup below would create or select resources the
    // template throws away — and picking a project from another organization
    // would silently override the chosen org. Skip it entirely.
    if (isMediaLibraryTemplate) {
      if (hasProjectFlag) {
        output.warn(
          'Project flags are ignored for the media-library-config template — it only records the organization.',
        )
      }
      trace.log({datasetName: '', selectedOption: 'skip', step: 'createOrSelectDataset'})
      return {
        datasetName: '',
        displayName: '',
        isFirstProject: false,
        organizationId: appOrganizationId,
        projectId: '',
      }
    }

    const {
      datasetName: appDatasetName,
      displayName: appDisplayName,
      organizationId: resolvedOrganizationId,
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
      organizationId: resolvedOrganizationId ?? appOrganizationId,
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
    organizationId: projectResult.organizationId,
    projectId: projectResult.projectId,
  }
}
