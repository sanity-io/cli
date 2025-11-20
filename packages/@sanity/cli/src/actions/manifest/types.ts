import {type SanityDocumentLike} from '@sanity/types'
import {type MediaLibraryConfig} from 'sanity'

export const SANITY_WORKSPACE_SCHEMA_ID_PREFIX = '_.schemas'
export const SANITY_WORKSPACE_SCHEMA_TYPE = 'system.schema'
export const CURRENT_WORKSPACE_SCHEMA_VERSION = '2025-05-01'

export type ManifestSerializable =
  | boolean
  | ManifestSerializable[]
  | number
  | string
  | {[k: string]: ManifestSerializable}

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

export interface ManifestSchemaType {
  name: string
  type: string

  deprecated?: {
    reason: string
  }
  fields?: ManifestField[]
  fieldsets?: ManifestFieldset[]
  hidden?: 'conditional' | boolean
  lists?: ManifestTitledValue[]
  //portable text
  marks?: {
    annotations?: ManifestArrayMember[]
    decorators?: ManifestTitledValue[]
  }
  of?: ManifestArrayMember[]
  options?: Record<string, ManifestSerializable>
  preview?: {
    select: Record<string, string>
  }
  readOnly?: 'conditional' | boolean
  styles?: ManifestTitledValue[]
  title?: string
  to?: ManifestReferenceMember[]
  validation?: ManifestValidationGroup[]

  // userland (assignable to ManifestSerializable | undefined)
  // not included to add some typesafty to extractManifest
  // [index: string]: unknown
}

export interface ManifestFieldset {
  [index: string]: ManifestSerializable | undefined
  name: string

  title?: string
}

export interface ManifestTitledValue {
  value: string

  title?: string
}

export type ManifestField = ManifestSchemaType & {fieldset?: string}
export type ManifestArrayMember = Omit<ManifestSchemaType, 'name'> & {name?: string}
export type ManifestReferenceMember = Omit<ManifestSchemaType, 'name'> & {name?: string}

export interface ManifestValidationGroup {
  rules: ManifestValidationRule[]

  level?: 'error' | 'info' | 'warning'
  message?: string
}

export type ManifestValidationRule = {
  [index: string]: ManifestSerializable | undefined
  constraint?: ManifestSerializable
  flag: string
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
export type PrefixedWorkspaceSchemaId = `${DefaultWorkspaceSchemaId}.${string}`
export type WorkspaceSchemaId = DefaultWorkspaceSchemaId | PrefixedWorkspaceSchemaId

export interface StoredWorkspaceSchema extends SanityDocumentLike {
  _id: WorkspaceSchemaId
  _type: typeof SANITY_WORKSPACE_SCHEMA_TYPE
  /**
   * The API expects JSON coming in, but will store a string to save on attribute paths.
   * Consumers must use JSON.parse on the value, put we deploy to the API using ManifestSchemaType[]
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
