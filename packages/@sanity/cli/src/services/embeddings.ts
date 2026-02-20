import {getProjectCliClient} from '@sanity/cli-core'
import {type EmbeddingsSettings, type EmbeddingsSettingsBody} from '@sanity/client'

import {DATASET_API_VERSION} from './datasets.js'

function getEmbeddingsClient(projectId: string) {
  return getProjectCliClient({
    apiVersion: DATASET_API_VERSION,
    projectId,
    requireUser: true,
  })
}

export async function getEmbeddingsSettings(
  projectId: string,
  dataset: string,
): Promise<EmbeddingsSettings> {
  const client = await getEmbeddingsClient(projectId)
  return client.datasets.getEmbeddingsSettings(dataset)
}

interface SetEmbeddingsOptions {
  dataset: string
  enabled: boolean
  projectId: string

  projection?: string
}

export async function setEmbeddingsSettings({
  dataset,
  enabled,
  projectId,
  projection,
}: SetEmbeddingsOptions): Promise<void> {
  const client = await getEmbeddingsClient(projectId)
  const body: EmbeddingsSettingsBody = {enabled, ...(projection ? {projection} : {})}
  await client.datasets.editEmbeddingsSettings(dataset, body)
}
