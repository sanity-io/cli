import {getGlobalCliClient} from '@sanity/cli-core'

export const MEDIA_LIBRARY_API_VERSION = 'v2025-02-19'

const MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME = 'sanity.mediaLibrary.assetAspect'

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
    uri: `/media-libraries/${mediaLibraryId}/mutate`,
  })
}

interface MediaLibrary {
  id: string
  organizationId: string
  status: 'active'
}

/**
 * Get a list of media libraries for a project
 * @param projectId - The project ID
 * @returns A promise that resolves to the media libraries
 *
 * @internal
 */
export async function getMediaLibraries(projectId: string) {
  const client = await getMediaLibraryClient()

  return client.request<{data: MediaLibrary[]}>({
    method: 'GET',
    query: {
      projectId,
    },
    uri: `/media-libraries`,
  })
}
