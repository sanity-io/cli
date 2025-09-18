import {getProjectCliClient} from '@sanity/cli-core'

export const PROJECT_FEATURES_API_VERSION = 'v2025-09-16'

/**
 * Get the list of features available for a project
 */
export async function getProjectFeatures(projectId: string): Promise<string[]> {
  const client = await getProjectCliClient({
    apiVersion: PROJECT_FEATURES_API_VERSION,
    projectId,
    requireUser: true,
  })

  return client.request<string[]>({uri: '/features'})
}
