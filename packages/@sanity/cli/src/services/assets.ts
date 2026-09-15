import {type Readable, Transform} from 'node:stream'

import {getProjectCliClient} from '@sanity/cli-core'
import {type SanityAssetDocument, type SanityImageAssetDocument} from '@sanity/client'
import {filter, lastValueFrom, map, Observable, race} from 'rxjs'

export const ASSETS_API_VERSION = 'v2024-06-24'

/**
 * Content Lake allows itself 300 seconds to fetch the source URL and a further
 * budget to persist the asset, so this waits far longer than an ordinary API
 * call before giving up on a request that may still be doing useful work.
 */
const URL_INGEST_TIMEOUT_MS = 370_000

export type AssetType = 'file' | 'image'

function assetPathSegment(assetType: AssetType): string {
  return assetType === 'image' ? 'images' : 'files'
}

interface UploadAssetOptions {
  assetType: AssetType
  body: Readable
  dataset: string
  filename: string
  fileSize: number
  projectId: string

  contentType?: string
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

export async function uploadAsset({
  assetType,
  body,
  contentType,
  dataset,
  filename,
  fileSize,
  onProgress,
  projectId,
  signal,
}: UploadAssetOptions) {
  signal?.throwIfAborted()

  const client = await getProjectCliClient({
    apiVersion: ASSETS_API_VERSION,
    dataset,
    projectId,
    requestTagPrefix: 'sanity.cli.assets.upload',
    requireUser: true,
  })
  signal?.throwIfAborted()

  let uploadedBytes = 0
  const uploadStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      uploadedBytes += chunk.length
      onProgress?.((uploadedBytes / fileSize) * 100)
      callback(null, chunk)
    },
  })
  body.on('error', (error) => uploadStream.destroy(error)).pipe(uploadStream)

  const response$ = client.observable.assets
    .upload(assetType, uploadStream, {
      ...(contentType ? {contentType} : {}),
      filename,
      tag: 'asset.upload',
    })
    .pipe(
      filter((event) => event.type === 'response'),
      map((event) => event.body.document),
    )

  if (!signal) return lastValueFrom(response$)

  const abort$ = new Observable<never>((subscriber) => {
    const abortUpload = () => {
      body.destroy()
      uploadStream.destroy()
      subscriber.error(signal.reason instanceof Error ? signal.reason : new Error('SIGINT'))
    }

    signal.addEventListener('abort', abortUpload, {once: true})
    return () => signal.removeEventListener('abort', abortUpload)
  })

  return lastValueFrom(race(response$, abort$))
}

interface IngestAssetFromUrlOptions {
  assetType: AssetType
  dataset: string
  projectId: string
  url: string

  filename?: string
  signal?: AbortSignal
}

/**
 * Create an asset from a URL that Content Lake fetches itself.
 *
 * The bytes never pass through this process, so unlike {@link uploadAsset}
 * there is no stream to pipe and no progress to report — the request is a
 * small JSON body and a long wait. The source must be reachable without
 * authentication from Sanity's side; a presigned URL qualifies, a private one
 * behind a login does not.
 *
 * `assets.upload()` always streams a body, so this calls the endpoint directly
 * rather than going through the client's asset helper.
 */
export async function ingestAssetFromUrl({
  assetType,
  dataset,
  filename,
  projectId,
  signal,
  url,
}: IngestAssetFromUrlOptions): Promise<SanityAssetDocument | SanityImageAssetDocument> {
  signal?.throwIfAborted()

  const client = await getProjectCliClient({
    apiVersion: ASSETS_API_VERSION,
    dataset,
    projectId,
    requestTagPrefix: 'sanity.cli.assets.upload',
    requireUser: true,
  })
  signal?.throwIfAborted()

  const response = await client.request<{
    document: SanityAssetDocument | SanityImageAssetDocument
  }>({
    body: {url, ...(filename ? {filename} : {})},
    method: 'POST',
    signal,
    tag: 'asset.upload.from-url',
    timeout: URL_INGEST_TIMEOUT_MS,
    url: `/assets/${assetPathSegment(assetType)}/${dataset}/from-url`,
  })

  return response.document
}
