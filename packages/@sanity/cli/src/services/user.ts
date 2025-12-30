import {getGlobalCliClient, type SanityOrgUser} from '@sanity/cli-core'

import {INIT_API_VERSION} from '../actions/init/constants.js'

export async function getCliUser() {
  const client = await getGlobalCliClient({
    apiVersion: INIT_API_VERSION,
    requireUser: true,
  })

  return client.users.getById('me') as unknown as SanityOrgUser
}
