import {Readable} from 'node:stream'

import {getBackupDetails} from '../../services/backup.js'

export interface File {
  name: string
  type: string
  url: string
}

interface GetBackupResponse {
  createdAt: string
  files: File[]
  totalFiles: number

  nextCursor?: string
}

export class PaginatedGetBackupStream extends Readable {
  public totalFiles = 0
  private readonly backupId: string
  private cursor = ''
  private readonly datasetName: string
  private readonly projectId: string

  constructor(projectId: string, datasetName: string, backupId: string) {
    super({objectMode: true})
    this.projectId = projectId
    this.datasetName = datasetName
    this.backupId = backupId
  }

  async _read(): Promise<void> {
    try {
      const data = await this.fetchNextBackupPage()

      // Set totalFiles when it's fetched for the first time
      if (this.totalFiles === 0) {
        this.totalFiles = data.totalFiles
      }

      for (const file of data.files) {
        this.push(file)
      }

      if (typeof data.nextCursor === 'string' && data.nextCursor !== '') {
        this.cursor = data.nextCursor
      } else {
        // No more pages left to fetch.
        this.push(null)
      }
    } catch (err) {
      this.destroy(err instanceof Error ? err : new Error(String(err)))
    }
  }

  // fetchNextBackupPage fetches the next page of backed up files from the backup API.
  fetchNextBackupPage(): Promise<GetBackupResponse> {
    try {
      return getBackupDetails({
        backupId: this.backupId,
        datasetName: this.datasetName,
        nextCursor: this.cursor === '' ? undefined : this.cursor,
        projectId: this.projectId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Downloading dataset backup failed: ${message}`)
    }
  }
}
