import {type SchemaValidationProblemGroup} from '@sanity/types'

export const internal = Symbol('internal')

export interface Deprecation {
  deprecationReason: string
}

export interface ApiSpecification {
  interfaces: ConvertedInterface[]
  types: (ConvertedType | ConvertedUnion)[]
}

/**
 * @public
 */
export interface GraphQLAPIConfig {
  /**
   * Suffix to use for generated filter types.
   *
   * Optional, Defaults to `Filter`.
   *
   */
  filterSuffix?: string

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

export interface DeployResponse {
  location: string
}

interface ApiChange {
  description: string
  type: string
}

export interface ValidationResponse {
  breakingChanges: ApiChange[]
  dangerousChanges: ApiChange[]
  validationError: string
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

export type TypeResolvedGraphQLAPI = Omit<GraphQLAPIConfig, 'source' | 'workspace'> &
  ResolvedSerializableProperties

export interface ExtractedGraphQLAPI {
  dataset: string
  projectId: string

  extracted?: ApiSpecification
  extractionError?: string
  filterSuffix?: string
  generation?: string
  id?: string
  nonNullDocumentFields?: boolean
  playground?: boolean
  schemaErrors?: SchemaValidationProblemGroup[]
  tag?: string
}

export interface GraphQLWorkerResult {
  apis: ExtractedGraphQLAPI[]

  configErrors?: SchemaValidationProblemGroup[]
}

interface ConvertedNode {
  description: string
  fields: ConvertedFieldDefinition[]
  kind: 'Interface' | 'List' | 'Type' | 'Union'
  name: string
  type: string
}

type FieldArg =
  | {isFieldFilter?: boolean; name: string; type: string}
  | {name: string; type: ConvertedNode}

export interface ConvertedField extends Partial<Deprecation> {
  fieldName: string
  type: string

  args?: FieldArg[]
  description?: string
  filter?: string
  isNullable?: boolean
  isRawAlias?: boolean
  isReference?: boolean
  kind?: 'List'
  originalName?: string
}

interface ConvertedListField extends ConvertedField {
  children: {
    inlineObjects?: string[]
    type: string
  }
  kind: 'List'
}

export interface ApiCustomizationOptions {
  filterSuffix?: string
}

export type InputFilterField =
  | ListDefinition
  | {
      constraint: {
        comparator: string
        field?: string
      }
      description?: string
      fieldName: string
      type: string
    }

export type ConvertedFieldDefinition = ConvertedField | ConvertedListField

interface ListDefinition {
  children: {isNullable?: boolean; type: string}
  kind: 'List'

  isNullable?: boolean
}

export interface ConvertedEnum {
  kind: 'Enum'
  name: string
  values: {
    description?: string
    name: string
    value: unknown
  }[]
}

export interface ConvertedInterface {
  fields: ConvertedFieldDefinition[]
  kind: 'Interface'
  name: string

  description?: string
}

export interface ConvertedUnion {
  kind: 'Union'
  name: string
  types: string[]

  interfaces?: string[]
}

export interface ConvertedDocumentType extends ConvertedType {
  interfaces: ['Document', ...string[]]
}

export interface ConvertedType extends Partial<Deprecation> {
  fields: ConvertedFieldDefinition[]
  kind: 'Interface' | 'Type'
  name: string
  type: string

  crossDatasetReferenceMetadata?: {
    dataset: string
    typeNames: string[]
  }
  description?: string
  interfaces?: string[]
  [internal]?: Partial<Deprecation>
  isReference?: boolean
  originalName?: string
}

export interface InputObjectType {
  fields: unknown[] // @todo
  kind: 'InputObject'
  name: string

  isConstraintFilter?: boolean
}

export interface QueryDefinition extends Partial<Deprecation> {
  args: {
    description?: string
    isFieldFilter?: boolean
    isNullable?: boolean
    name: string
    type: ListDefinition | string
  }[]
  fieldName: string

  type: ListDefinition | string

  constraints?: {
    comparator: string
    field?: string
    value?: {argName: string; kind: 'argumentValue'}
  }[]

  filter?: string
}

export interface GeneratedApiSpecification {
  generation: string
  interfaces: ConvertedInterface[]
  queries: QueryDefinition[]
  types: (ConvertedEnum | ConvertedType | ConvertedUnion | InputObjectType)[]
}
