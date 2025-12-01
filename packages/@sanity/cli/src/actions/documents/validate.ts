import path from 'node:path'
import {Worker} from 'node:worker_threads'

import {type ClientConfig} from '@sanity/client'
import {type ValidationMarker} from '@sanity/types'
import {readPackageUp} from 'read-package-up'

import {
  type ValidateDocumentsWorkerData,
  type ValidationWorkerChannel,
} from '../../threads/validateDocuments.js'
import {createReceiver, type WorkerChannelReceiver} from '../../util/workerChannels.js'

export interface ValidateDocumentsOptions<TReturn = unknown> {
  clientConfig: ClientConfig

  dataset?: string // override
  level?: 'error' | 'info' | 'warning'
  maxCustomValidationConcurrency?: number
  maxFetchConcurrency?: number
  ndjsonFilePath?: string
  projectId?: string // override
  reporter?: (worker: WorkerChannelReceiver<ValidationWorkerChannel>) => TReturn
  studioHost?: string
  workDir?: string
  workspace?: string
}

export interface DocumentValidationResult {
  documentId: string
  documentType: string
  level: ValidationMarker['level']
  markers: ValidationMarker[]
  revision: string
}

const defaultReporter = ({dispose, stream}: WorkerChannelReceiver<ValidationWorkerChannel>) => {
  async function* createValidationGenerator() {
    for await (const {documentId, documentType, level, markers, revision} of stream.validation()) {
      const result: DocumentValidationResult = {
        documentId,
        documentType,
        level,
        markers,
        revision,
      }

      yield result
    }

    await dispose()
  }

  return createValidationGenerator()
}

export function validateDocuments<TReturn>(
  options: Required<Pick<ValidateDocumentsOptions<TReturn>, 'reporter'>> &
    ValidateDocumentsOptions<TReturn>,
): Promise<TReturn>
export function validateDocuments(
  options: ValidateDocumentsOptions,
): Promise<AsyncIterable<DocumentValidationResult>>
export async function validateDocuments(options: ValidateDocumentsOptions): Promise<unknown> {
  const {
    clientConfig,
    dataset,
    level,
    maxCustomValidationConcurrency,
    maxFetchConcurrency,
    ndjsonFilePath,
    projectId,
    reporter = defaultReporter,
    workDir = process.cwd(),
    workspace,
  } = options

  const rootPkgPath = (await readPackageUp({cwd: import.meta.dirname}))?.path

  if (!rootPkgPath) {
    throw new Error('Could not find root directory for `sanity` package')
  }

  const workerPath = path.join(path.dirname(rootPkgPath), 'dist', 'threads', 'validateDocuments.js')

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {requester: _, ...serializableClientConfig} = clientConfig

  const worker = new Worker(workerPath, {
    env: process.env,
    workerData: {
      // removes props in the config that make this object fail to serialize
      clientConfig: structuredClone(serializableClientConfig),
      dataset,
      level,
      maxCustomValidationConcurrency,
      maxFetchConcurrency,
      ndjsonFilePath,
      projectId,
      studioHost: options.studioHost,
      workDir,
      workspace,
    } satisfies ValidateDocumentsWorkerData,
  })

  return reporter(createReceiver<ValidationWorkerChannel>(worker))
}
