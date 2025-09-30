import {getProjectCliClient} from '@sanity/cli-core'

export async function getProjectFeatures(projectId: string) {
  const client = await getProjectCliClient({
    apiVersion: 'v2025-09-16',
    projectId,
    requireUser: true,
  })

  return client.request({uri: '/features'})
}
