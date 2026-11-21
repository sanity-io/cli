import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  type ManifestSchemaType,
  SANITY_WORKSPACE_SCHEMA_ID_PREFIX,
} from '@sanity/cli-core/schemas'
import {type SanityDocumentLike} from '@sanity/types'
import {type MediaLibraryConfig} from 'sanity'
import {z} from 'zod/mini'

export {type CoreAppManifest, coreAppManifestSchema, type StudioManifest} from '@sanity/cli-core'
export {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  type ManifestField,
  type ManifestFieldset,
  type ManifestSchemaType,
  type ManifestSerializable,
  type ManifestTitledValue,
  type ManifestValidationGroup,
  type ManifestValidationRule,
  SANITY_WORKSPACE_SCHEMA_ID_PREFIX,
} from '@sanity/cli-core/schemas'

export interface CreateManifest {
  createdAt: string
  studioVersion: string | null
  version: number
  workspaces: ManifestWorkspaceFile[]
}

export interface ManifestWorkspaceFile extends Omit<CreateWorkspaceManifest, 'schema' | 'tools'> {
  schema: string // filename
  tools: string // filename
}

export interface CreateWorkspaceManifest {
  basePath: string
  dataset: string
  /**
   * returns null in the case of the icon not being able to be stringified
   */
  icon: string | null
  name: string
  projectId: string
  schema: ManifestSchemaType[]
  tools: ManifestTool[]

  mediaLibrary?: MediaLibraryConfig
  subtitle?: string
  title?: string
}

export interface ManifestTool {
  /**
   * returns null in the case of the icon not being able to be stringified
   */
  icon: string | null
  name: string
  title: string
  type: string | null
}

export type DefaultWorkspaceSchemaId = `${typeof SANITY_WORKSPACE_SCHEMA_ID_PREFIX}.${string}`
type PrefixedWorkspaceSchemaId = `${DefaultWorkspaceSchemaId}.${string}`
export type WorkspaceSchemaId = DefaultWorkspaceSchemaId | PrefixedWorkspaceSchemaId

export interface StoredWorkspaceSchema extends SanityDocumentLike {
  _id: WorkspaceSchemaId
  _type: 'system.schema'
  /**
   * The API expects JSON coming in, but will store a string to save on attribute paths.
   * Consumers must use JSON.parse on the value, but we deploy to the API using ManifestSchemaType[]
   */
  schema: ManifestSchemaType[] | string
  /* api-like version string: date at which the format had a meaningful change */
  version: typeof CURRENT_WORKSPACE_SCHEMA_VERSION | undefined
  workspace: {
    name: string
    title?: string
  }

  tag?: string
}

export const extractManifestWorkerData = z.object({configPath: z.string(), workDir: z.string()})

export type ExtractManifestWorkerData = z.infer<typeof extractManifestWorkerData>

/**
 * Workspace metadata + pre-extracted manifest schema for deployment.
 * The schema must already be in ManifestSchemaType[] format (extracted from
 * the live Schema object before any structured clone boundary).
 */
export interface WorkspaceSchemaInput {
  dataset: string
  manifestSchema: ManifestSchemaType[]
  name: string
  projectId: string

  title?: string
}
