import {getGlobalCliClient} from '@sanity/cli-core'

import {APP_WORKBENCH_API_VERSION} from '../actions/deploy/apiVersion.js'

/** Soft-deletes the application and all its deployments; already deleted counts as done. */
export async function deleteApplication(applicationId: string): Promise<void> {
  const client = await getGlobalCliClient({
    apiVersion: APP_WORKBENCH_API_VERSION,
    requireUser: true,
  })
  try {
    await client.request({method: 'DELETE', uri: `/applications/${applicationId}`})
  } catch (err) {
    if ((err as {statusCode?: number})?.statusCode !== 404) throw err
  }
}
