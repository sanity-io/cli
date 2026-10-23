import {type StoredWorkspaceSchema} from '@sanity/cli-build/_internal/manifest'
import {getGlobalCliClient} from '@sanity/cli-core'
import {EXPERIMENTAL_API_WARNING, isHttpError} from '@sanity/client'
import {type SchemaSummary} from '@sanity/schema-descriptor-utils'

export const SCHEMA_API_VERSION = 'v2025-03-01'

/** The dataset schema binding endpoint is only available on the experimental API version. */
export const SCHEMA_BINDING_API_VERSION = 'vX'

export const SCHEMA_DESCRIPTOR_API_VERSION = 'v2025-06-01'

/**
 * The schema bound to a dataset, as returned by `GET /schemas/dataset/:projectId.:dataset`.
 * Only `_meta` is used: its `types` are hydrated for display and cannot be compiled.
 */
export interface DatasetSchemaBinding {
  _meta: {
    producer: 'api' | 'blueprint' | 'mcp' | 'studio'
    /** The Lexicon descriptor ID of the bound schema. Also returned as the `ETag`. */
    schemaVersion: string
    source: string | null
    sourceLabel: string | null
  }
  name: string
}

async function getSchemaClient() {
  return await getGlobalCliClient({
    apiVersion: SCHEMA_API_VERSION,
    requireUser: true,
  })
}

export async function getSchemas(dataset: string, projectId: string, id?: string) {
  const client = await getSchemaClient()

  return client.request<StoredWorkspaceSchema[]>({
    method: 'GET',
    url: `/projects/${projectId}/datasets/${dataset}/schemas${id ? `/${id}` : ''}`,
  })
}

export async function deleteSchema(dataset: string, projectId: string, id: string) {
  const exists = await getSchemas(dataset, projectId, id)

  if (exists?.length === 0) {
    return {
      deleted: false,
    }
  }

  const client = await getSchemaClient()

  return client.request({
    method: 'DELETE',
    url: `/projects/${projectId}/datasets/${dataset}/schemas/${id}`,
  })
}

/**
 * Gets the schema bound to a dataset, or `null` when the dataset has no binding.
 */
export async function getDatasetSchemaBinding(
  projectId: string,
  dataset: string,
): Promise<DatasetSchemaBinding | null> {
  const client = await getGlobalCliClient({
    apiVersion: SCHEMA_BINDING_API_VERSION,
    // The endpoint has no stable version yet, and the warning would interrupt command output.
    // The client splits the warning header on commas, so its second clause is matched separately.
    ignoreWarnings: [EXPERIMENTAL_API_WARNING, 'which will change without warning'],
    requireUser: true,
  })

  try {
    return await client.request<DatasetSchemaBinding>({
      url: `/schemas/dataset/${encodeURIComponent(`${projectId}.${dataset}`)}`,
    })
  } catch (err) {
    if (isHttpError(err) && err.statusCode === 404) return null
    throw err
  }
}

/**
 * Gets a schema descriptor from Lexicon by its ID, such as a binding's `schemaVersion`.
 */
export async function getSchemaDescriptor(id: string): Promise<SchemaSummary> {
  const client = await getGlobalCliClient({
    apiVersion: SCHEMA_DESCRIPTOR_API_VERSION,
    requireUser: true,
  })

  return client.request<SchemaSummary>({
    url: `/descriptors/schemas/${encodeURIComponent(id)}`,
  })
}

export async function updateSchemas<T>(dataset: string, projectId: string, schemas: T) {
  const client = await getSchemaClient()

  return client.request({
    body: {
      schemas,
    },
    method: 'PUT',
    url: `/projects/${projectId}/datasets/${dataset}/schemas`,
  })
}
