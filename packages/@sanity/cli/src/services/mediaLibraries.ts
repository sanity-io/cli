import {getGlobalCliClient} from '@sanity/cli-core'
import {
  type FileAsset,
  type ImageAsset,
  MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME,
  type MediaLibraryAssetAspectDocument,
  type SanityDocument,
} from '@sanity/types'

import {URL_INGEST_TIMEOUT_MS} from './assets.js'

export const MEDIA_LIBRARY_API_VERSION = 'v2025-02-19'

async function getMediaLibraryClient() {
  return getGlobalCliClient({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    requireUser: true,
  })
}

interface DeleteAspectOptions {
  aspectName: string
  mediaLibraryId: string
  projectId: string
}

interface DeleteAspectResponse {
  results: Array<{id: string}>
}

/**
 * Delete an aspect from a media library
 * @param options - The options for deleting an aspect
 * @returns A promise that resolves to the deletion response
 *
 * @internal
 */
export async function deleteAspect(options: DeleteAspectOptions): Promise<DeleteAspectResponse> {
  const {aspectName, mediaLibraryId} = options

  const client = await getMediaLibraryClient()

  return client.request<DeleteAspectResponse>({
    body: {
      mutations: [
        {
          delete: {
            params: {
              id: aspectName,
              type: MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME,
            },
            query: `*[_type == $type && _id == $id]`,
          },
        },
      ],
    },
    method: 'POST',
    url: `/media-libraries/${mediaLibraryId}/mutate`,
  })
}

export interface MediaLibrary {
  id: string
  organizationId: string
  status: 'active' | 'inactive'
}

interface MediaLibrariesResponse {
  data: MediaLibrary[]
}

/**
 * Get a list of media libraries for a project
 * @param projectId - The project ID
 * @returns A promise that resolves to the media libraries
 *
 * @internal
 */
export async function getMediaLibraries(projectId: string): Promise<MediaLibrary[]> {
  const client = await getMediaLibraryClient()

  const response = await client.request<MediaLibrariesResponse>({
    method: 'GET',
    query: {
      projectId,
    },
    url: `/media-libraries`,
  })

  return response.data.filter((library) => library.status === 'active')
}

interface DeployAspectsOptions {
  aspects: MediaLibraryAssetAspectDocument[]
  mediaLibraryId: string
}

interface DeployAspectsResponse {
  results: Array<{id: string; operation: string}>
}

/**
 * Deploy one or more aspects to a media library
 * @param options - The options for deploying aspects
 * @returns A promise that resolves to the deployment response
 *
 * @internal
 */
export async function deployAspects(options: DeployAspectsOptions): Promise<DeployAspectsResponse> {
  const {aspects, mediaLibraryId} = options

  const client = await getMediaLibraryClient()

  return client.request<DeployAspectsResponse>({
    body: {
      mutations: aspects.map((aspect) => ({
        createOrReplace: aspect,
      })),
    },
    method: 'POST',
    url: `/media-libraries/${mediaLibraryId}/mutate`,
  })
}

/**
 * The pair of documents a media library creates for one asset: the
 * `sanity.asset` document that carries aspects, and the asset instance holding
 * the file metadata.
 *
 * @internal
 */
export interface MediaLibraryAsset {
  asset: SanityDocument & {
    _type: 'sanity.asset'
    aspects: unknown
    assetType: FileAsset['_type'] | ImageAsset['_type']
  }
  assetInstance: FileAsset | ImageAsset
}

interface IngestMediaLibraryAssetFromUrlOptions {
  mediaLibraryId: string
  url: string

  aspects?: Record<string, unknown>
  filename?: string
  signal?: AbortSignal
}

/**
 * Create a media library asset from a URL that Sanity fetches itself.
 *
 * Unlike the dataset equivalent in `./assets.ts`, the asset type is not part of
 * the request — the library derives it from the fetched content — and aspects
 * are set inline here rather than patched on afterwards.
 *
 * The source must be reachable without authentication from Sanity's side; a
 * presigned URL qualifies, a private one behind a login does not.
 *
 * @internal
 */
export async function ingestMediaLibraryAssetFromUrl({
  aspects,
  filename,
  mediaLibraryId,
  signal,
  url,
}: IngestMediaLibraryAssetFromUrlOptions): Promise<MediaLibraryAsset> {
  signal?.throwIfAborted()

  const client = await getMediaLibraryClient()

  return client.request<MediaLibraryAsset>({
    body: {
      url,
      ...(filename ? {filename} : {}),
      ...(aspects ? {aspects} : {}),
    },
    method: 'POST',
    signal,
    tag: 'asset.ingest.from-url',
    timeout: URL_INGEST_TIMEOUT_MS,
    url: `/media-libraries/${mediaLibraryId}/from-url`,
  })
}
