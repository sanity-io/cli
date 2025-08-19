import {type SanityClient} from '@sanity/client'

import {type TokenResponse} from '../actions/tokens/types.js'

interface AddTokenOptions {
  client: SanityClient
  label: string

  projectId: string
  roleName: string
}

/**
 * Add a token to a project
 * @param options - The options for adding a token to a project
 * @returns A promise that resolves to the token response
 *
 * @internal
 */
export function addTokenToProject(options: AddTokenOptions): Promise<TokenResponse> {
  const {client, label, projectId, roleName} = options

  return client.request<TokenResponse>({
    body: {label, roleName},
    method: 'POST',
    uri: `/projects/${projectId}/tokens`,
  })
}
