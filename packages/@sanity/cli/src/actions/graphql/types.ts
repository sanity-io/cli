import {type Schema} from '@sanity/types'

export interface GraphQLAPIConfig {
  /**
   * Dataset name for this API
   */
  dataset?: string

  /**
   * Generation of API to deploy
   *
   * Optional, defaults to `gen3` (which is the only option, currently)
   */
  generation?: 'gen1' | 'gen2' | 'gen3'

  /**
   * ID of GraphQL API. Only (currently) required when using the `--api` flag
   * for `sanity graphql deploy`, in order to only deploy a specific API.
   */
  id?: string

  /**
   * Whether or not to enable the GraphQL v2021-10-21 query semantics
   */
  nonNullDocumentFields?: boolean

  /**
   * Whether or not to enable the GraphQL Playground for this API
   *
   * Optional, defaults to `true` in development mode,  `false` otherwise
   */
  playground?: boolean

  /**
   * Project ID for this API
   */
  projectId?: string

  /**
   * Name of source containing the schema to deploy, within the configured workspace
   *
   * Optional, defaults to `default` (eg the one used if no `name` is defined)
   */
  source?: string

  /**
   * API tag for this API - allows deploying multiple different APIs to a single dataset
   *
   * Optional, defaults to `default`
   */
  tag?: string

  /**
   * Name of workspace containing the schema to deploy
   *
   * Optional, defaults to `default` (eg the one used if no `name` is defined)
   */
  workspace?: string
}
export interface SchemaDefinitionish {
  name: string
  type: string

  fields?: SchemaDefinitionish[]
}

interface ResolvedSerializableProperties {
  dataset: string
  projectId: string
  schemaTypes: SchemaDefinitionish[]
}

export interface ResolvedSourceProperties {
  dataset: string
  projectId: string
  schema: Schema
}

export type TypeResolvedGraphQLAPI = Omit<GraphQLAPIConfig, 'source' | 'workspace'> &
  ResolvedSerializableProperties

export type ResolvedGraphQLAPI = Omit<GraphQLAPIConfig, 'source' | 'workspace'> &
  ResolvedSourceProperties
