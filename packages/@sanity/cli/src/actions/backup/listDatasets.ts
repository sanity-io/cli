import {getProjectCliClient} from '@sanity/cli-core'
import {type DatasetsResponse} from '@sanity/client'

import {BACKUP_API_VERSION} from './constants.js'

interface ListDatasetsOptions {
  projectId: string
}

export async function listDatasets({projectId}: ListDatasetsOptions): Promise<DatasetsResponse> {
  const client = await getProjectCliClient({
    apiVersion: BACKUP_API_VERSION,
    projectId,
    requireUser: true,
  })
  return client.datasets.list()
}
