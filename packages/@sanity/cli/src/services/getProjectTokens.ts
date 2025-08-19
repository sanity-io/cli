import {type SanityClient} from '@sanity/client'

import {type Token} from '../actions/tokens/types.js'

interface GetProjectTokensOptions {
  client: SanityClient
  projectId: string
}

export async function getProjectTokens(options: GetProjectTokensOptions): Promise<Token[]> {
  const {client, projectId} = options

  return client.request<Token[]>({uri: `/projects/${projectId}/tokens`})
}
