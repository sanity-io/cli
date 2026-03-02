import {createStudioWorker, getGlobalCliClient} from '@sanity/cli-core'
import {type ClientConfig} from '@sanity/client'
import {type ValidationMarker} from '@sanity/types'
import {WorkerChannelReceiver} from '@sanity/worker-channels'

import {DOCUMENTS_API_VERSION} from './constants.js'
import {
  Level,
  type ValidateDocumentsWorkerData,
  type ValidationReceiver,
  type ValidationWorkerChannel,
} from './types.js'

interface ValidateDocumentsOptions<TReturn = unknown> {
  dataset?: string // override
  level?: Level
  maxCustomValidationConcurrency?: number
  maxFetchConcurrency?: number
  ndjsonFilePath?: string
  projectId?: string // override
  reporter?: (worker: ValidationReceiver) => TReturn
  studioHost?: string
  workDir?: string
  workspace?: string
}

interface DocumentValidationResult {
  documentId: string
  documentType: string
  level: ValidationMarker['level']
  markers: ValidationMarker[]
  revision: string
}

const defaultReporter = ({dispose, stream}: ValidationReceiver) => {
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

  const apiClient = await getGlobalCliClient({
    apiVersion: DOCUMENTS_API_VERSION,
    requireUser: true,
  })

  const clientConfig: ClientConfig = {
    ...apiClient.config(),
    // we set this explictly to true because we pass in a token via the
    // `clientConfiguration` object and also mock a browser environment in
    // this worker which triggers the browser warning
    ignoreBrowserTokenWarning: true,
    // Removing from object so config can be serialized
    // before sent to validation worker
    requester: undefined,
    // we set this explictly to true because the default client configuration
    // from the CLI comes configured with `useProjectHostname: false` when
    // `requireProject` is set to false
    useProjectHostname: true,
  }

  const worker = createStudioWorker(new URL('validateDocuments.worker.js', import.meta.url), {
    name: 'validateDocuments',
    studioRootPath: workDir,
    workerData: {
      // removes props in the config that make this object fail to serialize
      clientConfig: structuredClone(clientConfig),
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

  const receiver = WorkerChannelReceiver.from<ValidationWorkerChannel>(worker)
  const validationReceiver: ValidationReceiver = {
    dispose: async () => {
      receiver.unsubscribe()
      return worker.terminate()
    },
    event: receiver.event,
    stream: receiver.stream,
  }

  return reporter(validationReceiver)
}
