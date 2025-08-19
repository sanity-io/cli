import {type SanityClient} from '@sanity/client'

interface DeleteTokenFromProjectOptions {
  client: SanityClient
  projectId: string
  tokenId: string
}

export async function deleteTokenFromProject(
  options: DeleteTokenFromProjectOptions,
): Promise<void> {
  const {client, projectId, tokenId} = options

  return client.request({
    method: 'DELETE',
    uri: `/projects/${projectId}/tokens/${tokenId}`,
  })
}
