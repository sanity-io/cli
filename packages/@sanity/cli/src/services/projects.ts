import {getProjectCliClient} from '@sanity/cli-core'

export const PROJECTS_API_VERSION = '2025-09-22'

export async function getProjectById(projectId: string) {
  const client = await getProjectCliClient({
    apiVersion: PROJECTS_API_VERSION,
    projectId,
    requireUser: true,
  })

  return client.projects.getById(projectId)
}
