import {resolve} from 'node:path'

import {
  BatchInputError,
  getBatchLocalPath,
  prepareBatchEntry,
  readBatchManifest,
} from './batchManifest.js'
import {
  type BatchState,
  type BatchSuccess,
  readBatchState,
  writeBatchState,
} from './batchUploadState.js'
import {uploadAssetFromFile} from './uploadAssetFromFile.js'

export type BatchResult =
  | BatchSuccess
  | (Omit<BatchSuccess, 'status'> & {status: 'skipped'})
  | {
      error?: {code: string; message: string}
      key: string
      status: 'failed' | 'not-started' | 'validated'
    }

interface BatchOptions {
  dataset: string
  manifestPath: string
  onResult: (result: BatchResult) => void
  projectId: string

  concurrency?: number
  dryRun?: boolean
  failFast?: boolean
  resume?: boolean
  signal?: AbortSignal
  statePath?: string
}

export async function uploadAssetBatch(options: BatchOptions): Promise<boolean> {
  const {dataset, projectId, signal} = options
  const concurrency = options.concurrency ?? 4
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new BatchInputError('Invalid concurrency. Use a positive whole number.')
  }
  const manifestPath = resolve(options.manifestPath)
  const entries = await readBatchManifest(manifestPath)
  const statePath = resolve(options.statePath ?? `${manifestPath}.state.json`)
  if (options.resume && statePath === manifestPath)
    throw new BatchInputError('Choose a state path different from the manifest.')
  if (
    options.resume &&
    entries.some((entry) => getBatchLocalPath(entry, manifestPath) === statePath)
  ) {
    throw new BatchInputError('Choose a state path different from every asset source.')
  }
  const state: BatchState =
    options.resume && !options.dryRun ? await readBatchState(statePath) : {entries: [], version: 1}
  let next = 0
  let failed = false
  let stateFailed = false
  let writes = Promise.resolve()

  async function persist(record: BatchState['entries'][number]) {
    const pending = writes.then(async () => {
      state.entries = state.entries.filter((item) => item.result.key !== record.result.key)
      state.entries.push(record)
      await writeBatchState(statePath, state)
    })
    writes = pending.catch(() => {
      stateFailed = true
    })
    await pending
  }

  async function worker() {
    while (next < entries.length) {
      signal?.throwIfAborted()
      const entry = entries[next++]
      if ((options.failFast && failed) || stateFailed) {
        options.onResult({key: entry.key, status: 'not-started'})
        continue
      }
      let phase = 'VALIDATION_FAILED'
      let result: BatchResult
      try {
        const prepared = await prepareBatchEntry(entry, manifestPath)
        if (options.resume && prepared.filePath === statePath)
          throw new Error('State cannot overwrite an asset source.')
        const previous = state.entries.find(
          (item) =>
            item.result.key === entry.key &&
            item.fingerprint === prepared.fingerprint &&
            item.projectId === projectId &&
            item.dataset === dataset,
        )
        if (options.dryRun) {
          result = {key: entry.key, status: 'validated'}
        } else if (options.resume && previous) {
          result = {...previous.result, status: 'skipped'}
        } else {
          phase = 'UPLOAD_FAILED'
          const asset = await uploadAssetFromFile({
            assetType: prepared.type,
            contentType: prepared.contentType,
            dataset,
            filename: prepared.filename,
            filePath: prepared.filePath,
            projectId,
            signal,
          })
          result = {
            asset: {_id: asset._id, url: asset.url},
            key: entry.key,
            reference: {_type: prepared.type, asset: {_ref: asset._id, _type: 'reference'}},
            status: 'uploaded',
          }
          if (options.resume) {
            phase = 'STATE_WRITE_FAILED'
            await persist({dataset, fingerprint: prepared.fingerprint, projectId, result})
          }
        }
      } catch {
        signal?.throwIfAborted()
        failed = true
        const messages: Record<string, string> = {
          STATE_WRITE_FAILED:
            'Asset uploaded, but resume state could not be saved. Check the state directory permissions before retrying.',
          UPLOAD_FAILED:
            'Cannot upload this asset. Check the file format and dataset write access, then retry.',
          VALIDATION_FAILED:
            'Cannot read this entry. Check its fields and that its source is a readable local file.',
        }
        result = {error: {code: phase, message: messages[phase]}, key: entry.key, status: 'failed'}
      }
      options.onResult(result)
    }
  }
  const completed = await Promise.allSettled(
    Array.from({length: Math.min(concurrency, entries.length)}, worker),
  )
  const rejected = completed.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  return !failed
}
