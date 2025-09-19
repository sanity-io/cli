import {getGlobalCliClient} from '@sanity/cli-core'

import {BACKUP_API_VERSION} from '../actions/backup/constants.js'

export interface BackupItem {
  createdAt: string
  id: string
}

interface ListBackupsResponse {
  backups: BackupItem[]
}

interface BackupDetailsResponse {
  createdAt: string
  files: Array<{
    name: string
    type: string
    url: string
  }>
  totalFiles: number

  nextCursor?: string
}

export async function listBackups(options: {
  datasetName: string
  limit?: number
  projectId: string
}): Promise<ListBackupsResponse> {
  const client = await getGlobalCliClient({
    apiVersion: BACKUP_API_VERSION,
    requireUser: true,
  })

  const query: Record<string, string> = {}
  if (options.limit) {
    query.limit = options.limit.toString()
  }

  return client.request({
    query,
    uri: `/projects/${options.projectId}/datasets/${options.datasetName}/backups`,
  })
}

export async function getBackupDetails(options: {
  backupId: string
  datasetName: string
  nextCursor?: string
  projectId: string
}): Promise<BackupDetailsResponse> {
  const client = await getGlobalCliClient({
    apiVersion: BACKUP_API_VERSION,
    requireUser: true,
  })

  const query: Record<string, string> = {}
  if (options.nextCursor) {
    query.nextCursor = options.nextCursor
  }

  return client.request({
    query,
    uri: `/projects/${options.projectId}/datasets/${options.datasetName}/backups/${options.backupId}`,
  })
}
