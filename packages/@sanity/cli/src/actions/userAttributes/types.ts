export type AttributeType =
  | 'boolean'
  | 'integer'
  | 'integer-array'
  | 'number'
  | 'number-array'
  | 'string'
  | 'string-array'

export type AttributeSource = 'saml' | 'sanity'

export interface AttributeDefinition {
  createdAt: string
  key: string
  sources: AttributeSource[]
  type: AttributeType

  alreadyExists?: boolean
}

export interface AttributeDefinitionListResponse {
  definitions: AttributeDefinition[]
  hasMore: boolean

  nextCursor?: string | null
}

export type AttributeValue = (number | string)[] | boolean | number | string

export interface UserAttributeValues {
  saml?: AttributeValue
  sanity?: AttributeValue
}

export interface UserAttribute {
  activeSource: AttributeSource
  activeValue: AttributeValue
  key: string
  type: AttributeType
  values: UserAttributeValues
}

export interface UserAttributesGetResponse {
  attributes: UserAttribute[]
  organizationId: string
  sanityUserId: string
}

export interface UserAttributesResponse extends UserAttributesGetResponse {
  updatedAt: string
}

export interface SetAttributeInput {
  key: string
  value: AttributeValue
}
