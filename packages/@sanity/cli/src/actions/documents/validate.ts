import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Worker} from 'node:worker_threads'

import {getGlobalCliClient} from '@sanity/cli-core'
import {type ClientConfig} from '@sanity/client'
import {type ValidationMarker} from '@sanity/types'
import {readPackageUp} from 'read-package-up'

import {
  type ValidateDocumentsWorkerData,
  type ValidationWorkerChannel,
} from '../../threads/validateDocuments.js'
import {createReceiver, type WorkerChannelReceiver} from '../../util/workerChannels.js'
import {DOCUMENTS_API_VERSION} from './constants.js'
import {Level} from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface ValidateDocumentsOptions<TReturn = unknown> {
  dataset?: string // override
  level?: Level
  maxCustomValidationConcurrency?: number
  maxFetchConcurrency?: number
  ndjsonFilePath?: string
  projectId?: string // override
  reporter?: (worker: WorkerChannelReceiver<ValidationWorkerChannel>) => TReturn
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

  const rootPkgPath = (await readPackageUp({cwd: __dirname}))?.path

  if (!rootPkgPath) {
    throw new Error('Could not find root directory for `sanity` package')
  }

  const workerPath = path.join(path.dirname(rootPkgPath), 'dist', 'threads', 'validateDocuments.js')

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

  const worker = new Worker(workerPath, {
    env: process.env,
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

  return reporter(createReceiver<ValidationWorkerChannel>(worker))
}
