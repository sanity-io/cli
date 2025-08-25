import {type SanityClient} from '@sanity/client'

import {tokensDebug} from '../actions/tokens/tokensDebug.js'
import {type Token} from '../actions/tokens/types.js'

interface GetTokensForProjectOptions {
  client: SanityClient
  projectId: string
}

/**
 * Get all tokens for a project
 *
 * @returns A list of all tokens for a project
 * @internal
 */
export async function getTokensForProject({
  client,
  projectId,
}: GetTokensForProjectOptions): Promise<Token[]> {
  try {
    const tokens = await client.request<Token[]>({
      uri: `/projects/${projectId}/tokens`,
    })

    tokensDebug(`Found ${tokens.length} tokens for project ${projectId}`)
    return tokens
  } catch (error) {
    tokensDebug(`Error fetching tokens for project ${projectId}:`, error)
    throw error
  }
}
