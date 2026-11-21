export type ManifestSerializable =
  | boolean
  | ManifestSerializable[]
  | number
  | string
  | {[k: string]: ManifestSerializable}

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

type ManifestArrayMember = Omit<ManifestSchemaType, 'name'> & {name?: string}
type ManifestReferenceMember = Omit<ManifestSchemaType, 'name'> & {name?: string}
export type ManifestField = ManifestSchemaType & {fieldset?: string}

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
