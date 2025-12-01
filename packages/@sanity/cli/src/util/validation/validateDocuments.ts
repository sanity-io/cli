import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import {Readable} from 'node:stream'
import {workerData as _workerData, isMainThread, parentPort} from 'node:worker_threads'

import {getStudioConfig, stubs} from '@sanity/cli-core'
import {
  type ClientConfig,
  createClient,
  type SanityClient,
  type SanityDocument,
} from '@sanity/client'
import {type ValidationContext, type ValidationMarker} from '@sanity/types'
import pMap from 'p-map'
import {createSchema, isRecord, validateDocument, Workspace} from 'sanity'

import {extractDocumentsFromNdjsonOrTarball} from '../extractDocumentsFromNdjsonOrTarball.js'
import {
  createReporter,
  type WorkerChannel,
  type WorkerChannelEvent,
  type WorkerChannelStream,
} from '../workerChannels.js'
import {
  DOCUMENT_VALIDATION_TIMEOUT,
  getReferenceIds,
  isValidId,
  levelValues,
  MAX_VALIDATION_CONCURRENCY,
  REFERENCE_INTEGRITY_BATCH_SIZE,
  shouldIncludeDocument,
} from './validateDocumentsUtils.js'

const mockStubs = stubs as Record<string, unknown>
const mockedGlobalThis: Record<string, unknown> = globalThis
for (const key in stubs) {
  if (!(key in mockedGlobalThis)) {
    mockedGlobalThis[key] = mockStubs[key]
  }
}

interface AvailabilityResponse {
  omitted: {id: string; reason: 'existence' | 'permission'}[]
}

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

const {
  clientConfig,
  dataset,
  level,
  maxCustomValidationConcurrency,
  maxFetchConcurrency,
  ndjsonFilePath,
  projectId,
  studioHost,
  workDir,
  workspace: workspaceName,
} = _workerData as ValidateDocumentsWorkerData

if (isMainThread || !parentPort) {
  throw new Error('This module must be run as a worker thread')
}

const report = createReporter<ValidationWorkerChannel>(parentPort)

// eslint-disable-next-line n/no-unsupported-features/node-builtins
async function* readerToGenerator(reader: ReadableStreamDefaultReader<Uint8Array>) {
  while (true) {
    const {done, value} = await reader.read()
    if (value) yield value
    if (done) return
  }
}

await main()
process.exit()

async function loadWorkspace() {
  const workspaces = await getStudioConfig(workDir, {resolvePlugins: true})

  if (!workspaces || workspaces.length === 0) {
    throw new Error(`Configuration did not return any workspaces.`)
  }

  let _workspace
  if (workspaceName) {
    _workspace = workspaces.find((w) => w.name === workspaceName)
    if (!_workspace) {
      throw new Error(`Could not find any workspaces with name \`${workspaceName}\``)
    }
  } else {
    if (workspaces.length !== 1) {
      throw new Error(
        "Multiple workspaces found. Please specify which workspace to use with '--workspace'.",
      )
    }
    _workspace = workspaces[0]
  }

  const workspace = _workspace as unknown as Workspace
  if (workspace.schema?._original) {
    const newSchema = createSchema(workspace.schema._original)
    workspace.schema = newSchema
  }

  const client = createClient({
    ...clientConfig,
    dataset: dataset || workspace.dataset,
    projectId: projectId || workspace.projectId,
    requestTagPrefix: 'sanity.cli.validate',
  }).config({apiVersion: 'v2021-03-25'})

  report.event.loadedWorkspace({
    basePath: workspace.basePath,
    dataset: workspace.dataset,
    name: workspace.name,
    projectId: workspace.projectId,
  })

  return {client, workspace}
}

async function downloadFromExport(client: SanityClient) {
  const exportUrl = new URL(client.getUrl(`/data/export/${client.config().dataset}`, false))

  const documentCount = await client.fetch('length(*)')
  report.event.loadedDocumentCount({documentCount})

  const {token} = client.config()
  const response = await fetch(exportUrl, {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    headers: new Headers({...(token && {Authorization: `Bearer ${token}`})}),
  })

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Could not get reader from response body.')

  let downloadedCount = 0
  const referencedIds = new Set<string>()
  const documentIds = new Set<string>()
  const lines = readline.createInterface({input: Readable.from(readerToGenerator(reader))})

  // Note: we stream the export to a file and then re-read from that file to
  // make this less memory intensive.
  // this is a similar pattern to the import/export CLI commands
  const slugDate = new Date()
    .toISOString()
    .replaceAll(/[^a-z0-9]/gi, '-')
    .toLowerCase()
  const tempOutputFile = path.join(os.tmpdir(), `sanity-validate-${slugDate}.ndjson`)
  const outputStream = fs.createWriteStream(tempOutputFile)

  for await (const line of lines) {
    const document = JSON.parse(line) as SanityDocument

    if (shouldIncludeDocument(document)) {
      documentIds.add(document._id)
      for (const referenceId of getReferenceIds(document)) {
        referencedIds.add(referenceId)
      }

      outputStream.write(`${line}\n`)
    }

    downloadedCount++
    report.stream.exportProgress.emit({documentCount, downloadedCount})
  }

  await new Promise<void>((resolve, reject) =>
    outputStream.close((err) => (err ? reject(err) : resolve())),
  )

  report.stream.exportProgress.end()
  report.event.exportFinished({totalDocumentsToValidate: documentIds.size})

  const getDocuments = () =>
    extractDocumentsFromNdjsonOrTarball(fs.createReadStream(tempOutputFile))

  return {cleanup: () => fs.promises.rm(tempOutputFile), documentIds, getDocuments, referencedIds}
}

async function downloadFromFile(filePath: string) {
  const referencedIds = new Set<string>()
  const documentIds = new Set<string>()
  const getDocuments = () => extractDocumentsFromNdjsonOrTarball(fs.createReadStream(filePath))

  for await (const document of getDocuments()) {
    if (shouldIncludeDocument(document)) {
      documentIds.add(document._id)
      for (const referenceId of getReferenceIds(document)) {
        referencedIds.add(referenceId)
      }
    }
  }

  report.event.exportFinished({totalDocumentsToValidate: documentIds.size})

  return {cleanup: undefined, documentIds, getDocuments, referencedIds}
}

interface CheckReferenceExistenceOptions {
  client: SanityClient
  documentIds: Set<string>
  referencedIds: Set<string>
}

async function checkReferenceExistence({
  client,
  documentIds,
  referencedIds: _referencedIds,
}: CheckReferenceExistenceOptions) {
  const existingIds = new Set(documentIds)
  const idsToCheck = [..._referencedIds]
    .filter((id) => !existingIds.has(id) && isValidId(id))
    .toSorted()

  const batches: string[][] = []
  for (let i = 0; i < idsToCheck.length; i += REFERENCE_INTEGRITY_BATCH_SIZE) {
    batches.push(idsToCheck.slice(i, i + REFERENCE_INTEGRITY_BATCH_SIZE))
  }

  for (const batch of batches) {
    const {omitted} = await client.request<AvailabilityResponse>({
      json: true,
      query: {excludeContent: 'true'},
      tag: 'documents-availability',
      uri: client.getDataUrl('doc', batch.join(',')),
    })

    const omittedIds: Record<string, 'existence' | 'permission'> = {}
    for (const item of omitted) {
      omittedIds[item.id] = item.reason
    }

    for (const id of batch) {
      // unless the document ID is in the `omitted` object explictly due to
      // the reason `'existence'`, then it should exist
      if (omittedIds[id] !== 'existence') {
        existingIds.add(id)
      }
    }
  }
  report.event.loadedReferenceIntegrity()

  return {existingIds}
}

async function main() {
  // const cleanupBrowserEnvironment = mockBrowserEnvironment(workDir)

  let cleanupDownloadedDocuments: (() => Promise<void>) | undefined

  try {
    const {client, workspace} = await loadWorkspace()
    const {cleanup, documentIds, getDocuments, referencedIds} = ndjsonFilePath
      ? await downloadFromFile(ndjsonFilePath)
      : await downloadFromExport(client)
    cleanupDownloadedDocuments = cleanup
    const {existingIds} = await checkReferenceExistence({client, documentIds, referencedIds})

    const getClient = <TOptions extends Partial<ClientConfig>>(options: TOptions) =>
      client.withConfig(options)

    const getDocumentExists: ValidationContext['getDocumentExists'] = ({id}) =>
      Promise.resolve(existingIds.has(id))

    const getLevel = (markers: ValidationMarker[]) => {
      let foundWarning = false
      for (const marker of markers) {
        if (marker.level === 'error') return 'error'
        if (marker.level === 'warning') foundWarning = true
      }

      if (foundWarning) return 'warning'
      return 'info'
    }

    let validatedCount = 0

    const validate = async (document: SanityDocument) => {
      let markers: ValidationMarker[]

      try {
        const timeout = Symbol('timeout')

        const result = await Promise.race([
          validateDocument({
            document,
            environment: 'cli',
            getClient,
            getDocumentExists,
            maxCustomValidationConcurrency,
            maxFetchConcurrency,
            workspace,
          }),
          new Promise<typeof timeout>((resolve) =>
            setTimeout(() => resolve(timeout), DOCUMENT_VALIDATION_TIMEOUT),
          ),
        ])

        if (result === timeout) {
          throw new Error(
            `Document '${document._id}' failed to validate within ${DOCUMENT_VALIDATION_TIMEOUT}ms.`,
          )
        }

        markers = result
          // filter out unwanted levels
          .filter((marker) => {
            const markerValue = levelValues[marker.level]
            const flagLevelValue =
              levelValues[level as keyof typeof levelValues] ?? levelValues.info
            return markerValue <= flagLevelValue
          })
      } catch (err) {
        const errorMessage =
          isRecord(err) && typeof err.message === 'string' ? err.message : 'Unknown error'

        const message = `Exception occurred while validating value: ${errorMessage}`

        markers = [
          {
            level: 'error',
            message,
            path: [],
          },
        ]
      }

      validatedCount++

      const intentUrl =
        studioHost &&
        `${studioHost}${path.resolve(
          workspace.basePath,
          `/intent/edit/id=${encodeURIComponent(document._id)};type=${encodeURIComponent(
            document._type,
          )}`,
        )}`

      report.stream.validation.emit({
        documentId: document._id,
        documentType: document._type,
        ...(intentUrl && {intentUrl}),
        level: getLevel(markers),
        markers,
        revision: document._rev,
        validatedCount,
      })
    }

    await pMap(getDocuments(), validate, {concurrency: MAX_VALIDATION_CONCURRENCY})

    report.stream.validation.end()
  } finally {
    await cleanupDownloadedDocuments?.()
    // cleanupBrowserEnvironment()
  }
}
