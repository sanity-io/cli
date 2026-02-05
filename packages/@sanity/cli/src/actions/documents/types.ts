import {type Output} from '@sanity/cli-core'
import {type ClientConfig} from '@sanity/client'
import {type ValidationMarker} from '@sanity/types'

import {type ValidateDocumentsCommand} from '../../commands/documents/validate.js'
import {
  type WorkerChannel,
  type WorkerChannelEvent,
  type WorkerChannelReceiver,
  type WorkerChannelStream,
} from '../../util/workerChannels.js'

export type Level = ValidationMarker['level']

/** @internal */
export interface ValidateDocumentsWorkerData {
  workDir: string

  clientConfig?: Partial<ClientConfig>
  dataset?: string
  level?: ValidationMarker['level']
  maxCustomValidationConcurrency?: number
  maxFetchConcurrency?: number
  ndjsonFilePath?: string
  projectId?: string
  studioHost?: string
  workspace?: string
}

/** @internal */
export type ValidationWorkerChannel = WorkerChannel<{
  exportFinished: WorkerChannelEvent<{totalDocumentsToValidate: number}>
  exportProgress: WorkerChannelStream<{documentCount: number; downloadedCount: number}>
  loadedDocumentCount: WorkerChannelEvent<{documentCount: number}>
  loadedReferenceIntegrity: WorkerChannelEvent
  loadedWorkspace: WorkerChannelEvent<{
    basePath: string
    dataset: string
    name: string
    projectId: string
  }>
  validation: WorkerChannelStream<{
    documentId: string
    documentType: string
    intentUrl?: string
    level: ValidationMarker['level']
    markers: ValidationMarker[]
    revision: string
    validatedCount: number
  }>
}>

export type BuiltInValidationReporter = (options: {
  flags: ValidateDocumentsCommand['flags']
  output: Output
  worker: WorkerChannelReceiver<ValidationWorkerChannel>
}) => Promise<Level>
