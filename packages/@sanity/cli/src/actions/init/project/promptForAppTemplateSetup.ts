import {type SanityOrgUser, type TelemetryUserProperties} from '@sanity/cli-core'
import {select, Separator} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'

import {listProjects} from '../../../services/projects.js'
import {type InitStepResult} from '../../../telemetry/init.telemetry.js'
import {type InitContext} from '../types.js'
import {getOrCreateDataset} from './getOrCreateDataset.js'
import {getOrCreateProject} from './getOrCreateProject.js'
import {promptForProjectCreation} from './promptForProjectCreation.js'

export async function promptForAppTemplateSetup({
  coupon,
  dataset,
  newProject,
  organization,
  organizationId,
  output,
  planId,
  project,
  trace,
  unattended,
  user,
  visibility,
}: {
  coupon: string | undefined
  dataset: string | undefined
  newProject: string | undefined
  organization: string | undefined
  organizationId: string | undefined
  output: InitContext['output']
  planId: string | undefined
  project: string | undefined
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  unattended: boolean
  user: SanityOrgUser
  visibility: 'private' | 'public' | undefined
}): Promise<{datasetName: string; displayName: string; projectId: string}> {
  if (unattended) {
    if (!project && !newProject) {
      return {datasetName: '', displayName: '', projectId: ''}
    }
    const projectResult = await getOrCreateProject({
      coupon,
      newProject,
      organization,
      planId,
      project,
      unattended,
      user,
    })
    const datasetResult = await getOrCreateDataset({
      dataset,
      defaultConfig: undefined,
      displayName: projectResult.displayName,
      output,
      projectId: projectResult.projectId,
      showDefaultConfigPrompt: false,
      unattended,
      visibility,
    })
    return {
      datasetName: datasetResult.datasetName,
      displayName: projectResult.displayName,
      projectId: projectResult.projectId,
    }
  }

  const projects = (await listProjects()).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))

  const projectChoices = projects.map((p) => ({
    name: `${p.displayName} (${p.id})`,
    value: p.id,
  }))

  const SKIP_PROJECT = '__skip__'
  const NEW_PROJECT = '__new__'

  const selected = await select({
    choices: [
      {name: "Skip — I'll configure later", value: SKIP_PROJECT},
      {name: 'Create new project', value: NEW_PROJECT},
      ...(projectChoices.length > 0 ? [new Separator(), ...projectChoices] : []),
    ],
    message: 'Configure a project for this app?',
  })

  if (selected === SKIP_PROJECT) {
    trace.log({selectedOption: 'skip', step: 'configureAppProject'})
    return {datasetName: '', displayName: '', projectId: ''}
  }

  trace.log({
    selectedOption: selected === NEW_PROJECT ? 'create' : 'existing',
    step: 'configureAppProject',
  })

  const projectResult =
    selected === NEW_PROJECT
      ? await promptForProjectCreation({
          coupon,
          isUsersFirstProject: projects.length === 0,
          organizationId,
          organizations: [],
          planId,
          user,
        })
      : {
          displayName: projects.find((p) => p.id === selected)?.displayName ?? '',
          projectId: selected,
        }

  const datasetResult = await getOrCreateDataset({
    dataset,
    defaultConfig: undefined,
    displayName: projectResult.displayName,
    output,
    projectId: projectResult.projectId,
    showDefaultConfigPrompt: false,
    unattended: false,
    visibility,
  })
  return {
    datasetName: datasetResult.datasetName,
    displayName: projectResult.displayName,
    projectId: projectResult.projectId,
  }
}
