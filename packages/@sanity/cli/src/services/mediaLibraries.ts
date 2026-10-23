import {getGlobalCliClient} from '@sanity/cli-core'
import {
  type FileAsset,
  type ImageAsset,
  MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME,
  type MediaLibraryAssetAspectDocument,
  type SanityDocument,
} from '@sanity/types'

import {ASSET_UPLOAD_REQUEST_TAG_PREFIX, URL_INGEST_TIMEOUT_MS} from './assets.js'

export const MEDIA_LIBRARY_API_VERSION = 'v2025-02-19'

async function getMediaLibraryClient(options: {requestTagPrefix?: string} = {}) {
  const {requestTagPrefix} = options

  return getGlobalCliClient({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    ...(requestTagPrefix ? {requestTagPrefix} : {}),
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

/** One listing endpoint, scoped by either owner — only the query param differs. */
async function listActiveMediaLibraries(
  query: {organizationId: string} | {projectId: string},
): Promise<MediaLibrary[]> {
  const client = await getMediaLibraryClient()

  const response = await client.request<MediaLibrariesResponse>({
    method: 'GET',
    query,
    url: `/media-libraries`,
  })

  return response.data.filter((library) => library.status === 'active')
}

/**
 * Get a list of active media libraries for a project
 * @param projectId - The project ID
 * @returns A promise that resolves to the media libraries
 *
 * @internal
 */
export function getMediaLibraries(projectId: string): Promise<MediaLibrary[]> {
  return listActiveMediaLibraries({projectId})
}

/**
 * Get a list of active media libraries for an organization
 * @param organizationId - The organization ID
 * @returns A promise that resolves to the active media libraries
 *
 * @internal
 */
export function getMediaLibrariesForOrganization(organizationId: string): Promise<MediaLibrary[]> {
  return listActiveMediaLibraries({organizationId})
}

interface QueryResponse<T> {
  result?: T
}

/**
 * A stored `sanity.asset.aspect` document as the query API returns it: `_id`
 * is guaranteed by the document store, everything else is validated by the
 * consumer (`aspectDocumentToFieldModule`).
 */
export interface StoredAspectDocument {
  _id: string

  assetType?: unknown
  definition?: unknown
  public?: unknown
}

/** Query page size — see the cursor loop in `queryAllPages`. */
const QUERY_PAGE_SIZE = 1000

/**
 * Run a media-library GROQ query to exhaustion, paging on an `_id` cursor:
 * the query API caps single-response sizes, and a truncated read would
 * silently drop documents. Only an *empty* page ends the loop — a short page
 * is not trusted as exhaustion, in case the endpoint ever returns fewer rows
 * than the requested slice; the cursor advances past the last returned id
 * either way, so partial slices just mean extra round-trips.
 */
async function queryAllPages<T extends {_id: string}>(options: {
  /** GROQ filter the `_id` cursor condition is appended to, e.g. `_type == $type`. */
  filter: string
  mediaLibraryId: string
  params: Record<string, unknown>
  /** GROQ projection, e.g. `{_id}`. Omitted, the whole documents return. */
  projection?: string
}): Promise<T[]> {
  const {filter, mediaLibraryId, params, projection = ''} = options
  const client = await getMediaLibraryClient()

  const documents: T[] = []
  let lastId = ''
  for (;;) {
    const response = await client.request<QueryResponse<T[]> | undefined>({
      body: {
        params: {...params, lastId},
        query: `*[${filter} && _id > $lastId] | order(_id) [0...${QUERY_PAGE_SIZE}]${projection}`,
      },
      method: 'POST',
      // `published` is this API version's default; pinned so a future default
      // change can never surface `drafts.*` duplicates of published documents.
      query: {perspective: 'published'},
      url: `/media-libraries/${mediaLibraryId}/query`,
    })
    const page = response?.result ?? []
    documents.push(...page)
    const last = page.at(-1)
    if (!last) break
    lastId = last._id
  }

  return documents
}

/**
 * Fetch the stored aspect documents of a media library
 * @param mediaLibraryId - The media library ID
 * @returns A promise that resolves to the aspect documents, ordered by id
 *
 * @internal
 */
export function getAspects(mediaLibraryId: string): Promise<StoredAspectDocument[]> {
  // An incomplete read here is destructive downstream: a pull would generate
  // a config missing the dropped aspects, and its deploy deletes them.
  return queryAllPages<StoredAspectDocument>({
    filter: '_type == $type',
    mediaLibraryId,
    params: {type: MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME},
  })
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

  const client = await getMediaLibraryClient({
    requestTagPrefix: ASSET_UPLOAD_REQUEST_TAG_PREFIX,
  })

  return client.request<MediaLibraryAsset>({
    body: {
      url,
      ...(filename ? {filename} : {}),
      ...(aspects ? {aspects} : {}),
    },
    method: 'POST',
    signal,
    tag: 'asset.upload.from-url',
    timeout: URL_INGEST_TIMEOUT_MS,
    url: `/media-libraries/${mediaLibraryId}/from-url`,
  })
}
