import {type Readable, Transform} from 'node:stream'

import {getProjectCliClient} from '@sanity/cli-core'
import {filter, lastValueFrom, map, Observable, race} from 'rxjs'

export const ASSETS_API_VERSION = 'v2024-06-24'

export type AssetType = 'file' | 'image'

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
