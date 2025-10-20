import {getProjectCliClient} from '@sanity/cli-core'
import {type DatasetAclMode} from '@sanity/client'
import EventSource from '@sanity/eventsource'
import {Observable} from 'rxjs'

export const DATASET_API_VERSION = 'v2025-09-16'

function getDatasetClient(projectId: string) {
  return getProjectCliClient({
    apiVersion: DATASET_API_VERSION,
    projectId,
    requireUser: true,
  })
}

export async function listDatasets(projectId: string) {
  const client = await getDatasetClient(projectId)
  return client.datasets.list()
}

export interface DatasetAliasDefinition {
  datasetName: string | null
  name: string
}

export async function listDatasetAliases(projectId: string): Promise<DatasetAliasDefinition[]> {
  const client = await getDatasetClient(projectId)
  return client.request<DatasetAliasDefinition[]>({uri: '/aliases'})
}

interface DeleteDatasetOptions {
  datasetName: string
  projectId: string
}

export async function deleteDataset({datasetName, projectId}: DeleteDatasetOptions) {
  const client = await getDatasetClient(projectId)
  return client.datasets.delete(datasetName)
}

interface EditDatasetAclOptions {
  aclMode: 'private' | 'public'
  datasetName: string
  projectId: string
}

export async function editDatasetAcl({aclMode, datasetName, projectId}: EditDatasetAclOptions) {
  const client = await getDatasetClient(projectId)
  return client.datasets.edit(datasetName, {aclMode})
}

interface CreateDatasetOptions {
  datasetName: string
  projectId: string

  aclMode?: DatasetAclMode
}

export async function createDataset({aclMode, datasetName, projectId}: CreateDatasetOptions) {
  const client = await getDatasetClient(projectId)

  if (aclMode) {
    return client.datasets.create(datasetName, {aclMode})
  }

  return client.datasets.create(datasetName)
}

interface CopyDatasetOptions {
  projectId: string
  skipHistory: boolean
  sourceDataset: string
  targetDataset: string
}

interface CopyDatasetResponse {
  jobId: string
}

export async function copyDataset({
  projectId,
  skipHistory,
  sourceDataset,
  targetDataset,
}: CopyDatasetOptions): Promise<CopyDatasetResponse> {
  const client = await getDatasetClient(projectId)
  return client.request<CopyDatasetResponse>({
    body: {
      skipHistory,
      targetDataset,
    },
    method: 'PUT',
    uri: `/datasets/${sourceDataset}/copy`,
  })
}

interface ListDatasetCopyJobsOptions {
  projectId: string

  limit?: number
  offset?: number
}

export interface DatasetCopyJob {
  createdAt: string
  id: string
  sourceDataset: string
  state: string
  targetDataset: string
  updatedAt: string
  withHistory: boolean
}

export async function listDatasetCopyJobs({
  limit,
  offset,
  projectId,
}: ListDatasetCopyJobsOptions): Promise<DatasetCopyJob[]> {
  const client = await getDatasetClient(projectId)
  const query: {limit?: string; offset?: string} = {}

  if (offset !== undefined && offset >= 0) {
    query.offset = `${offset}`
  }
  if (limit !== undefined && limit > 0) {
    query.limit = `${limit}`
  }

  return client.request<DatasetCopyJob[]>({
    method: 'GET',
    query,
    uri: `/projects/${projectId}/datasets/copy`,
  })
}

export interface CopyJobProgressEvent {
  type: 'reconnect' | string

  progress?: number
  state?: 'completed' | 'failed' | 'pending' | 'processing'
}

interface FollowCopyJobProgressOptions {
  jobId: string
  projectId: string
}

async function getJobListenUrl(projectId: string, jobId: string): Promise<string> {
  const client = await getDatasetClient(projectId)
  const baseUrl = client.config().url || 'https://api.sanity.io'
  return `${baseUrl}/jobs/${jobId}/listen`
}

export function followCopyJobProgress({
  jobId,
  projectId,
}: FollowCopyJobProgressOptions): Observable<CopyJobProgressEvent> {
  return new Observable<CopyJobProgressEvent>((observer) => {
    let progressSource: InstanceType<typeof EventSource> | null = null
    let stopped = false

    getJobListenUrl(projectId, jobId)
      .then((url) => {
        progressSource = new EventSource(url)

        function onError() {
          if (progressSource) {
            progressSource.close()
          }

          if (stopped) {
            return
          }

          observer.next({type: 'reconnect'})
          if (progressSource) {
            progressSource = new EventSource(url)
            attachListeners()
          }
        }

        function onChannelError(error: MessageEvent) {
          stopped = true
          if (progressSource) {
            progressSource.close()
          }
          const errorMessage = error.data
            ? `Copy job failed: ${error.data}`
            : 'Copy job failed: Connection to server lost. Please check the job status using --list and retry if needed.'
          observer.error(new Error(errorMessage))
        }

        function onMessage(event: MessageEvent) {
          const data = JSON.parse(event.data)
          if (data.state === 'failed') {
            const failureReason = data.message || data.error || 'Unknown reason'
            observer.error(new Error(`Copy job failed: ${failureReason}`))
          } else if (data.state === 'completed') {
            onComplete()
          } else {
            observer.next(data)
          }
        }

        function onComplete() {
          if (progressSource) {
            progressSource.removeEventListener('error', onError)
            progressSource.removeEventListener('channel_error', onChannelError)
            progressSource.removeEventListener('job', onMessage)
            progressSource.removeEventListener('done', onComplete)
            progressSource.close()
          }
          observer.complete()
        }

        function attachListeners() {
          if (progressSource) {
            progressSource.addEventListener('error', onError)
            progressSource.addEventListener('channel_error', onChannelError)
            progressSource.addEventListener('job', onMessage)
            progressSource.addEventListener('done', onComplete)
          }
        }

        attachListeners()
      })
      .catch((error) => {
        observer.error(error)
      })

    return () => {
      stopped = true
      if (progressSource) {
        progressSource.close()
      }
    }
  })
}
