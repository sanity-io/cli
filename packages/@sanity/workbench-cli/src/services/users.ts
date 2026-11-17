import {getGlobalCliClient} from '@sanity/cli-core'

const USERS_API_VERSION = 'v2025-05-14'

export async function getUser(
  userId: string,
  signal?: AbortSignal,
): Promise<{displayName: string}> {
  const client = await getGlobalCliClient({apiVersion: USERS_API_VERSION, requireUser: true})

  return client.request({signal, url: `/users/${userId}`})
}
