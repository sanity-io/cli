import {
  type ArraySchemaType,
  type BlockDefinition,
  type BooleanSchemaType,
  type CrossDatasetReferenceSchemaType,
  type FileSchemaType,
  type GlobalDocumentReferenceSchemaType,
  type MultiFieldSet,
  type NumberSchemaType,
  type ObjectField,
  type ObjectSchemaType,
  type ReferenceSchemaType,
  type Rule,
  type RuleSpec,
  type Schema,
  type SchemaType,
  type SchemaValidationValue,
  type SpanSchemaType,
  type StringSchemaType,
} from '@sanity/types'
import DOMPurify from 'isomorphic-dompurify'
import startCase from 'lodash-es/startCase.js'
import {renderToString} from 'react-dom/server'
import {
  ConcreteRuleClass,
  createSchema,
  type Workspace,
} from 'sanity'
import {ServerStyleSheet} from 'styled-components'

import {config} from './purifyConfig.js'
import {SchemaIcon, type SchemaIconProps} from './SchemaIcon.js'
import {
  getCustomFields,
  getDefinedTypeName,
  isCrossDatasetReference,
  isCustomized,
  isDefined,
  isGlobalDocumentReference,
  isPrimitive,
  isRecord,
  isReference,
  isString,
  isType,
} from './typeHelpers.js'
import {
  type CreateWorkspaceManifest,
  type ManifestField,
  type ManifestFieldset,
  type ManifestSchemaType,
  type ManifestSerializable,
  type ManifestTitledValue,
  type ManifestTool,
  type ManifestValidationGroup,
  type ManifestValidationRule,
} from './types'

interface Context {
  schema: Schema
}

type SchemaTypeKey =
  | 'group' // we strip this from fields
  | keyof ArraySchemaType
  | keyof BlockDefinition
  | keyof BooleanSchemaType
  | keyof FileSchemaType
  | keyof NumberSchemaType
  | keyof ObjectSchemaType
  | keyof ReferenceSchemaType
  | keyof StringSchemaType

type Validation = Record<string, never> | {validation: ManifestValidationGroup[]}
type ObjectFields = Record<string, never> | {fields: ManifestField[]}
type SerializableProp = ManifestSerializable | ManifestSerializable[] | undefined
type ManifestValidationFlag = ManifestValidationRule['flag']
type ValidationRuleTransformer = (rule: RuleSpec) => ManifestValidationRule | undefined

const MAX_CUSTOM_PROPERTY_DEPTH = 5

export default function extractWorkspaceManifest(workspaces: Workspace[]): CreateWorkspaceManifest[] {
  return workspaces.map((workspace) => {
    const serializedSchema = extractManifestSchemaTypes(workspace.schema as Schema)
    const serializedTools = extractManifestTools(workspace.tools)

    return {
      basePath: workspace.basePath,
      dataset: workspace.dataset,
      icon: resolveIcon({
        icon: workspace.icon,
        subtitle: workspace.subtitle,
        title: workspace.title,
      }),
      mediaLibrary: workspace.mediaLibrary,
      name: workspace.name,
      projectId: workspace.projectId,
      schema: serializedSchema,
      subtitle: workspace.subtitle,
      title: workspace.title,
      tools: serializedTools,
    }
  })
}

export function extractCreateWorkspaceManifest(workspace: Workspace): CreateWorkspaceManifest {
  const serializedSchema = extractManifestSchemaTypes(workspace.schema as Schema)
  const serializedTools = extractManifestTools(workspace.tools)

  return {
    basePath: workspace.basePath,
    dataset: workspace.dataset,
    icon: resolveIcon({
      icon: workspace.icon,
      subtitle: workspace.subtitle,
      title: workspace.title,
    }),
    mediaLibrary: workspace.mediaLibrary,
    name: workspace.name,
    projectId: workspace.projectId,
    schema: serializedSchema,
    subtitle: workspace.subtitle,
    title: workspace.title,
    tools: serializedTools,
  }
}

/**
 * Extracts all serializable properties from userland schema types,
 * so they best-effort can be used as definitions for Schema.compile
. */
function extractManifestSchemaTypes(schema: Schema): ManifestSchemaType[] {
  const typeNames = schema.getTypeNames()
  const context = {schema}

  const studioDefaultTypeNames = createSchema({name: 'default', types: []}).getTypeNames()

  return typeNames
    .filter((typeName) => !studioDefaultTypeNames.includes(typeName))
    .map((typeName) => schema.get(typeName))
    .filter((type): type is SchemaType => type !== undefined)
    .map((type) => transformType(type, context))
}

function transformCommonTypeFields(
  type: SchemaType & {fieldset?: string},
  typeName: string,
  context: Context,
): Omit<ManifestSchemaType, 'name' | 'title' | 'type'> {
  const arrayProps =
    typeName === 'array' && type.jsonType === 'array' ? transformArrayMember(type, context) : {}

  const referenceProps = isReference(type) ? transformReference(type) : {}
  const crossDatasetRefProps = isCrossDatasetReference(type)
    ? transformCrossDatasetReference(type)
    : {}
  const globalRefProps = isGlobalDocumentReference(type)
    ? transformGlobalDocumentReference(type)
    : {}

  const objectFields: ObjectFields =
    type.jsonType === 'object' && type.type && isCustomized(type)
      ? {
          fields: getCustomFields(type).map((objectField) => transformField(objectField, context)),
        }
      : {}

  return {
    ...retainCustomTypeProps(type),
    ...transformValidation(type.validation),
    ...ensureString('description', type.description),
    ...objectFields,
    ...arrayProps,
    ...referenceProps,
    ...crossDatasetRefProps,
    ...globalRefProps,
    ...ensureConditional('readOnly', type.readOnly),
    ...ensureConditional('hidden', type.hidden),
    ...transformFieldsets(type),
    // fieldset prop gets instrumented via getCustomFields
    ...ensureString('fieldset', type.fieldset),
    ...transformBlockType(type, context),
  }
}

function transformFieldsets(
  type: SchemaType,
): Record<string, never> | {fieldsets: ManifestFieldset[]} {
  if (type.jsonType !== 'object') {
    return {}
  }
  const fieldsets = type.fieldsets
    ?.filter((fs): fs is MultiFieldSet => !fs.single)
    .map((fs) => {
      const options = isRecord(fs.options) ? {options: retainSerializableProps(fs.options)} : {}
      return {
        name: fs.name,
        ...ensureCustomTitle(fs.name, fs.title),
        ...ensureString('description', fs.description),
        ...ensureConditional('readOnly', fs.readOnly),
        ...ensureConditional('hidden', fs.hidden),
        ...options,
      }
    })

  return fieldsets?.length ? {fieldsets} : {}
}

function transformType(type: SchemaType, context: Context): ManifestSchemaType {
  const typeName = type.type ? type.type.name : type.jsonType

  return {
    ...transformCommonTypeFields(type, typeName, context),
    name: type.name,
    type: typeName,
    ...ensureCustomTitle(type.name, type.title),
  }
}

function retainCustomTypeProps(type: SchemaType): Record<string, SerializableProp> {
  const manuallySerializedFields = new Set<SchemaTypeKey>([
    '__experimental_actions',
    '__experimental_formPreviewTitle',
    '__experimental_omnisearch_visibility',
    '__experimental_search',
    'components',
    'description',
    'fields',
    'fieldsets',
    //only exists on fields
    'group',
    'groups',
    'hidden',
    'icon',
    'jsonType',
    //explicitly added
    'name',
    'of',
    'orderings',
    'preview',
    'readOnly',
    'title',
    'to',
    // not serialized
    'type',
    'validation',
    // we know about these, but let them be generically handled
    // deprecated
    // rows (from text)
    // initialValue
    // options
    // crossDatasetReference props
  ])
  const typeWithoutManuallyHandledFields = Object.fromEntries(
    Object.entries(type).filter(
      ([key]) => !manuallySerializedFields.has(key as unknown as SchemaTypeKey),
    ),
  )
  return retainSerializableProps(typeWithoutManuallyHandledFields) as Record<
    string,
    SerializableProp
  >
}

function retainSerializableProps(maybeSerializable: unknown, depth = 0): SerializableProp {
  if (depth > MAX_CUSTOM_PROPERTY_DEPTH) {
    return undefined
  }

  if (!isDefined(maybeSerializable)) {
    return undefined
  }

  if (isPrimitive(maybeSerializable)) {
    // cull empty strings
    if (maybeSerializable === '') {
      return undefined
    }
    return maybeSerializable
  }

  // url-schemes ect..
  if (maybeSerializable instanceof RegExp) {
    return maybeSerializable.toString()
  }

  if (Array.isArray(maybeSerializable)) {
    const arrayItems = maybeSerializable
      .map((item) => retainSerializableProps(item, depth + 1))
      .filter((item): item is ManifestSerializable => isDefined(item))
    return arrayItems.length > 0 ? arrayItems : undefined
  }

  if (isRecord(maybeSerializable)) {
    const serializableEntries = Object.entries(maybeSerializable)
      .map(([key, value]) => {
        return [key, retainSerializableProps(value, depth + 1)]
      })
      .filter(([, value]) => isDefined(value))
    return serializableEntries.length > 0 ? Object.fromEntries(serializableEntries) : undefined
  }

  return undefined
}

function transformField(field: ObjectField & {fieldset?: string}, context: Context): ManifestField {
  const fieldType = field.type
  const typeName = getDefinedTypeName(fieldType) ?? fieldType.name
  return {
    ...transformCommonTypeFields(fieldType, typeName, context),
    name: field.name,
    type: typeName,
    ...ensureCustomTitle(field.name, fieldType.title),
    // this prop gets added synthetically via getCustomFields
    ...ensureString('fieldset', field.fieldset),
  }
}

function transformArrayMember(
  arrayMember: ArraySchemaType,
  context: Context,
): Pick<ManifestField, 'of'> {
  return {
    of: arrayMember.of.map((type) => {
      const typeName = getDefinedTypeName(type) ?? type.name
      return {
        ...transformCommonTypeFields(type, typeName, context),
        type: typeName,
        ...(typeName === type.name ? {} : {name: type.name}),
        ...ensureCustomTitle(type.name, type.title),
      }
    }),
  }
}

function transformReference(reference: ReferenceSchemaType): Pick<ManifestSchemaType, 'to'> {
  return {
    to: (reference.to ?? []).map((type) => {
      return {
        ...retainCustomTypeProps(type),
        type: type.name,
      }
    }),
  }
}

function transformCrossDatasetReference(
  reference: CrossDatasetReferenceSchemaType,
): Pick<ManifestSchemaType, 'preview' | 'to'> {
  return {
    to: (reference.to ?? []).map((crossDataset) => {
      const preview = crossDataset.preview?.select
        ? {preview: {select: crossDataset.preview.select}}
        : {}
      return {
        type: crossDataset.type,
        ...ensureCustomTitle(crossDataset.type, crossDataset.title),
        ...preview,
      }
    }),
  }
}

function transformGlobalDocumentReference(
  reference: GlobalDocumentReferenceSchemaType,
): Pick<ManifestSchemaType, 'preview' | 'to'> {
  return {
    to: (reference.to ?? []).map((crossDataset) => {
      const preview = crossDataset.preview?.select
        ? {preview: {select: crossDataset.preview.select}}
        : {}
      return {
        type: crossDataset.type,
        ...ensureCustomTitle(crossDataset.type, crossDataset.title),
        ...preview,
      }
    }),
  }
}

const transformTypeValidationRule: ValidationRuleTransformer = (rule) => {
  return {
    ...rule,
    constraint:
      'constraint' in rule &&
      (typeof rule.constraint === 'string'
        ? rule.constraint.toLowerCase()
        : retainSerializableProps(rule.constraint)),
  }
}

const validationRuleTransformers: Partial<
  Record<ManifestValidationFlag, ValidationRuleTransformer>
> = {
  type: transformTypeValidationRule,
}

function transformValidation(validation: SchemaValidationValue): Validation {
  const validationArray = (Array.isArray(validation) ? validation : [validation]).filter(
    (value): value is Rule => typeof value === 'object' && '_type' in value,
  )

  // we dont want type in the output as that is implicitly given by the typedef itself an will only bloat the payload
  const disallowedFlags = new Set(['type'])

  // Validation rules that refer to other fields use symbols, which cannot be serialized. It would
  // be possible to transform these to a serializable type, but we haven't implemented that for now.
  const disallowedConstraintTypes = new Set<symbol | unknown>([ConcreteRuleClass.FIELD_REF])

  const serializedValidation = validationArray
    .map(({_level, _message, _rules}) => {
      const message: Partial<Pick<ManifestValidationGroup, 'message'>> =
        typeof _message === 'string' ? {message: _message} : {}

      const serializedRules = _rules
        .filter((rule) => {
          if (!('constraint' in rule)) {
            return false
          }

          const {constraint, flag} = rule

          if (disallowedFlags.has(flag)) {
            return false
          }

          return !(
            typeof constraint === 'object' &&
            'type' in constraint &&
            disallowedConstraintTypes.has(constraint.type)
          )
        })
        .map((rule) => {
          const transformer: ValidationRuleTransformer =
            validationRuleTransformers[rule.flag] ??
            ((spec) => retainSerializableProps(spec) as ManifestValidationRule)

          const transformedRule = transformer(rule)

          if (!transformedRule) {
            return
          }

          return transformedRule
        })
        .filter((rule) => rule !== undefined)
    
      return {
        level: _level,
        rules: serializedRules,
        ...message,
      }
    })
    .filter((group) => group.rules.length > 0)

  return serializedValidation.length > 0 ? {validation: serializedValidation} : {}
}

function ensureCustomTitle(typeName: string, value: unknown) {
  const titleObject = ensureString('title', value)

  const defaultTitle = startCase(typeName)
  // omit title if its the same as default, to reduce payload
  if (titleObject.title === defaultTitle) {
    return {}
  }
  return titleObject
}

function ensureString<Key extends string>(key: Key, value: unknown) {
  if (typeof value === 'string') {
    return {
      [key]: value,
    }
  }

  return {}
}

function ensureConditional<const Key extends string>(key: Key, value: unknown) {
  if (typeof value === 'boolean') {
    return {
      [key]: value,
    }
  }

  if (typeof value === 'function') {
    return {
      [key]: 'conditional',
    }
  }

  return {}
}

function transformBlockType(
  blockType: SchemaType,
  context: Context,
): Pick<ManifestSchemaType, 'lists' | 'marks' | 'of' | 'styles'> | Record<string, never> {
  if (blockType.jsonType !== 'object' || !isType(blockType, 'block')) {
    return {}
  }

  const childrenField = blockType.fields?.find((field) => field.name === 'children') as
    | {type: ArraySchemaType}
    | undefined

  if (!childrenField) {
    return {}
  }
  const ofType = childrenField.type.of
  if (!ofType) {
    return {}
  }
  const spanType = ofType.find((memberType) => memberType.name === 'span') as
    | ObjectSchemaType
    | undefined
  if (!spanType) {
    return {}
  }
  const inlineObjectTypes = (ofType.filter((memberType) => memberType.name !== 'span') ||
    []) as ObjectSchemaType[]

  return {
    lists: resolveEnabledListItems(blockType),
    marks: {
      annotations: (spanType as SpanSchemaType).annotations.map((t) => transformType(t, context)),
      decorators: resolveEnabledDecorators(spanType),
    },
    of: inlineObjectTypes.map((t) => transformType(t, context)),
    styles: resolveEnabledStyles(blockType),
  }
}

function resolveEnabledStyles(blockType: ObjectSchemaType): ManifestTitledValue[] | undefined {
  const styleField = blockType.fields?.find((btField) => btField.name === 'style')
  return resolveTitleValueArray(styleField?.type?.options?.list)
}

function resolveEnabledDecorators(spanType: ObjectSchemaType): ManifestTitledValue[] | undefined {
  return 'decorators' in spanType ? resolveTitleValueArray(spanType.decorators) : undefined
}

function resolveEnabledListItems(blockType: ObjectSchemaType): ManifestTitledValue[] | undefined {
  const listField = blockType.fields?.find((btField) => btField.name === 'listItem')
  return resolveTitleValueArray(listField?.type?.options?.list)
}

function resolveTitleValueArray(possibleArray: unknown): ManifestTitledValue[] | undefined {
  if (!possibleArray || !Array.isArray(possibleArray)) {
    return undefined
  }
  const titledValues = possibleArray
    .filter(
      (d): d is {title?: string; value: string} => isRecord(d) && !!d.value && isString(d.value),
    )
    .map((item) => {
      return {
        value: item.value,
        ...ensureString('title', item.title),
      } satisfies ManifestTitledValue
    })
  if (!titledValues?.length) {
    return undefined
  }

  return titledValues
}

const extractManifestTools = (tools: Workspace['tools']): ManifestTool[] =>
  tools.map((tool) => {
    const {
      __internalApplicationType: type,
      icon,
      name,
      title,
    } = tool as Workspace['tools'][number] & {__internalApplicationType: string}
    return {
      icon: resolveIcon({
        icon: icon as SchemaIconProps['icon'],
        title,
      }),
      name,
      title,
      type: type || null,
    } satisfies ManifestTool
  })

const resolveIcon = (props: SchemaIconProps): string | null => {
  const sheet = new ServerStyleSheet()

  try {
    /**
     * You must render the element first so
     * the style-sheet above can be populated
     */
    const element = renderToString(sheet.collectStyles(<SchemaIcon {...props} />))
    const styleTags = sheet.getStyleTags()

    /**
     * We can then create a single string
     * of HTML combining our styles and element
     * before purifying below.
     */
    const html = `${styleTags}${element}`.trim()

    return DOMPurify.sanitize(html, config)
  } catch {
    return null
  } finally {
    sheet.seal()
  }
}
