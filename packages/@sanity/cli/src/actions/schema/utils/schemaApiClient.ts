import {type SanityClient} from '@sanity/client'

export async function createSchemaApiClient(apiClient: () => Promise<SanityClient>) {
  const client = (await apiClient()).withConfig({apiVersion: 'v2025-03-01', useCdn: false})

  const projectId = client.config().projectId
  const dataset = client.config().dataset
  if (!projectId) throw new Error('Project ID is not defined')
  if (!dataset) throw new Error('Dataset is not defined')

  return {
    client,
    dataset,
    projectId,
  }
}
