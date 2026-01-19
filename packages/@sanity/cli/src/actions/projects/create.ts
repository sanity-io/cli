import {getOrganization} from '../../util/organizationUtils'
import {
  createDatasetForProject,
  createProjectWithMetadata,
  type ProjectCreationResult,
  promptAndCreateDataset,
  promptForProjectName,
} from '../../util/projectUtils'

export interface CreateProjectActionOptions {
  projectName?: string
  organizationId?: string
  createDataset?: boolean
  datasetName?: string
  datasetVisibility?: 'public' | 'private'
  unattended?: boolean
}

export async function createProjectAction(
  options: CreateProjectActionOptions,
  context: CliCommandContext,
): Promise<ProjectCreationResult> {
  const {apiClient, prompt} = context
  const client = apiClient({requireUser: true, requireProject: false})

  // Create the project
  const project = await createProjectWithMetadata(apiClient, projectName, organization?.id, context)

  const result: ProjectCreationResult = {
    projectId: project.projectId,
    displayName: project.displayName,
    organization,
  }

  // Optionally create dataset
  if (options.createDataset) {
    // Use shared dataset creation logic (same as init command)
    const {name: datasetName, visibility} = await promptAndCreateDataset({
      context,
      datasetName: options.datasetName,
      datasetVisibility: options.datasetVisibility,
      unattended: options.unattended || !isInteractive,
    })

    try {
      const dataset = await createDatasetForProject(
        context,
        project.projectId,
        datasetName,
        visibility,
      )
      result.dataset = dataset
    } catch (err) {
      context.output.warn(`Project created but dataset creation failed: ${(err as Error).message}`)
    }
  }

  return result
}
