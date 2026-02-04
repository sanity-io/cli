import {getProjectCliClient} from '@sanity/cli-core'

export const DOCUMENTS_API_VERSION = 'v2021-03-25'

/**
 * Response from the document availability endpoint
 */
export interface AvailabilityResponse {
  omitted: {id: string; reason: 'existence' | 'permission'}[]
}

interface DocumentsClientOptions {
  dataset: string
  projectId: string
}

function getDocumentsClient({dataset, projectId}: DocumentsClientOptions) {
  return getProjectCliClient({
    apiVersion: DOCUMENTS_API_VERSION,
    dataset,
    projectId,
    requireUser: true,
  })
}

interface GetDocumentCountOptions {
  dataset: string
  projectId: string
}

/**
 * Get the total count of documents in the dataset
 */
export async function getDocumentCount({
  dataset,
  projectId,
}: GetDocumentCountOptions): Promise<number> {
  const client = await getDocumentsClient({dataset, projectId})
  return client.fetch('length(*)')
}

interface ExportDocumentsOptions {
  dataset: string
  projectId: string
}

/**
 * Export all documents from the dataset as a streaming response
 */
export async function exportDocuments({
  dataset,
  projectId,
}: ExportDocumentsOptions): Promise<Response> {
  const client = await getDocumentsClient({dataset, projectId})
  const exportUrl = new URL(client.getUrl(`/data/export/${dataset}`, false))

  const {token} = client.config()
  const response = await fetch(exportUrl, {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Headers is stable in modern Node.js
    headers: new Headers({...(token && {Authorization: `Bearer ${token}`})}),
  })

  return response
}

interface CheckDocumentAvailabilityOptions {
  dataset: string
  documentIds: string[]
  projectId: string
}

/**
 * Check the availability/existence of documents by their IDs
 */
export async function checkDocumentAvailability({
  dataset,
  documentIds,
  projectId,
}: CheckDocumentAvailabilityOptions): Promise<AvailabilityResponse> {
  const client = await getDocumentsClient({dataset, projectId})
  return client.request<AvailabilityResponse>({
    json: true,
    query: {excludeContent: 'true'},
    tag: 'documents-availability',
    uri: client.getDataUrl('doc', documentIds.join(',')),
  })
}
