import {type Output} from '@sanity/cli-core'
import {type ClientConfig} from '@sanity/client'
import {type ValidationMarker} from '@sanity/types'
import {type WorkerChannel, type WorkerChannelReceiver} from '@sanity/worker-channels'

import {type ValidateDocumentsCommand} from '../../commands/documents/validate.js'

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
export type ValidationWorkerChannel = WorkerChannel.Definition<{
  exportFinished: WorkerChannel.Event<{totalDocumentsToValidate: number}>
  exportProgress: WorkerChannel.Stream<{documentCount: number; downloadedCount: number}>
  loadedDocumentCount: WorkerChannel.Event<{documentCount: number}>
  loadedReferenceIntegrity: WorkerChannel.Event
  loadedWorkspace: WorkerChannel.Event<{
    basePath: string
    dataset: string
    name: string
    projectId: string
  }>
  validation: WorkerChannel.Stream<{
    documentId: string
    documentType: string
    intentUrl?: string
    level: ValidationMarker['level']
    markers: ValidationMarker[]
    revision: string
    validatedCount: number
  }>
}>

/**
 * Combines the package's receiver API with a `dispose()` method that
 * unsubscribes from worker messages AND terminates the worker thread.
 */
export interface ValidationReceiver {
  dispose: () => Promise<number>
  event: WorkerChannelReceiver<ValidationWorkerChannel>['event']
  stream: WorkerChannelReceiver<ValidationWorkerChannel>['stream']
}

export type BuiltInValidationReporter = (options: {
  flags: ValidateDocumentsCommand['flags']
  output: Output
  worker: ValidationReceiver
}) => Promise<Level>
