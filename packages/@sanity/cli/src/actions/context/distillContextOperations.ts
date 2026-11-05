import {
  type ContextOperation,
  type OperationField,
  type OperationFieldType,
} from './operationTypes.js'

type Schema = Record<string, unknown>

interface SpecParameter {
  in: string
  name: string

  description?: string
  required?: boolean
  schema?: Schema
}

interface SpecOperation {
  description?: string
  operationId?: string
  parameters?: SpecParameter[]
  requestBody?: {content?: Record<string, {schema?: Schema}>; required?: boolean}
  responses?: Record<string, {content?: Record<string, {schema?: Schema}>}>
  summary?: string
}

/** The parts of an OpenAPI 3 document the distiller reads */
export interface ContextOpenApiDocument {
  paths: Record<string, Record<string, unknown>>

  components?: {schemas?: Record<string, Schema>}
}

const PATH_PREFIX = '/{apiVersion}/context'
const METHODS = ['get', 'put', 'post', 'patch', 'delete']

function isSchema(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOperation(value: unknown): value is SpecOperation {
  return isSchema(value) && typeof value.operationId === 'string'
}

function schemas(value: unknown): Schema[] {
  return Array.isArray(value) ? value.filter((item) => isSchema(item)) : []
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function resolve(spec: ContextOpenApiDocument, schema: Schema): Schema {
  const ref = schema.$ref
  if (typeof ref !== 'string') return schema
  const name = ref.replace('#/components/schemas/', '')
  const target = spec.components?.schemas?.[name]
  if (!target) throw new Error(`Unresolved $ref ${ref}`)
  return resolve(spec, target)
}

/** A schema without the `null` branch of a nullable union, and whether it had one */
function unwrapNullable(
  spec: ContextOpenApiDocument,
  schema: Schema,
): {nullable: boolean; schema: Schema} {
  const resolved = resolve(spec, schema)
  const branches = schemas(resolved.anyOf ?? resolved.oneOf).map((branch) => resolve(spec, branch))
  const isNull = (branch: Schema) => branch.type === 'null'
  if (branches.some((branch) => isNull(branch))) {
    const rest = branches.filter((branch) => !isNull(branch))
    return {nullable: true, schema: rest.length === 1 ? rest[0] : {...resolved, anyOf: rest}}
  }
  if (Array.isArray(resolved.type) && resolved.type.includes('null')) {
    const type = resolved.type.filter((item) => item !== 'null')
    return {nullable: true, schema: {...resolved, type: type.length === 1 ? type[0] : type}}
  }
  const options = Array.isArray(resolved.enum) ? resolved.enum : []
  const withoutNull = options.includes(null)
    ? {...resolved, enum: options.filter((value) => value !== null)}
    : resolved
  // OpenAPI 3.0 marks a nullable schema with `nullable: true`
  return {nullable: options.includes(null) || resolved.nullable === true, schema: withoutNull}
}

function fieldType(schema: Schema): {options?: string[]; type: OperationFieldType} {
  const options = strings(schema.enum)
  if (typeof schema.const === 'string') return {options: [schema.const], type: 'string'}
  switch (schema.type) {
    case 'array': {
      const items = isSchema(schema.items) ? schema.items : {}
      return items.type === 'string' ? {type: 'string[]'} : {type: 'json'}
    }
    case 'boolean': {
      return {type: 'boolean'}
    }
    case 'integer': {
      return {type: 'integer'}
    }
    case 'number': {
      return {type: 'number'}
    }
    case 'string': {
      return options.length > 0 ? {options, type: 'string'} : {type: 'string'}
    }
    default: {
      return {type: 'json'}
    }
  }
}

function field(
  spec: ContextOpenApiDocument,
  location: OperationField['in'],
  name: string,
  rawSchema: Schema,
  extra: Partial<OperationField>,
): OperationField {
  const {nullable, schema} = unwrapNullable(spec, rawSchema)
  const {options, type} = fieldType(schema)
  // Query booleans travel as the strings `true` and `false`
  const isQueryBoolean = location === 'query' && options?.join(',') === 'true,false'
  return {
    in: location,
    name,
    ...(isQueryBoolean ? {type: 'boolean'} : {type, ...(options && {options})}),
    ...(nullable && {nullable}),
    ...extra,
    ...(text(rawSchema.description ?? schema.description) && {
      description: text(rawSchema.description ?? schema.description),
    }),
  }
}

/** The fields of an object body, with nested objects' fields flattened under their parent */
function objectFields(spec: ContextOpenApiDocument, object: Schema): OperationField[] {
  const required = new Set(strings(object.required))
  const properties = isSchema(object.properties) ? object.properties : {}
  return Object.entries(properties).flatMap(([name, raw]) => {
    if (!isSchema(raw)) return []
    const {schema} = unwrapNullable(spec, raw)
    if (schema.type === 'object' && isSchema(schema.properties)) {
      // A nested field is never required on its own, and keeps its full path of parents
      return objectFields(spec, schema).map(({required: _required, ...child}) => ({
        ...child,
        parent: child.parent ? `${name}.${child.parent}` : name,
      }))
    }
    return [field(spec, 'body', name, raw, required.has(name) ? {required: true} : {})]
  })
}

/** Variants of a `oneOf` body merged into one field list, each field marked with its variants */
function bodyFields(spec: ContextOpenApiDocument, rawBody: Schema): OperationField[] {
  const body = resolve(spec, rawBody)
  const variants = schemas(body.oneOf ?? body.anyOf).map((variant) => resolve(spec, variant))
  if (variants.length === 0) return objectFields(spec, body)

  const named = variants.map((variant) => {
    const properties = isSchema(variant.properties) ? variant.properties : {}
    const discriminator = isSchema(properties.type) ? fieldType(properties.type).options : undefined
    return {fields: objectFields(spec, variant), name: discriminator?.[0] ?? ''}
  })
  const merged = new Map<string, OperationField & {variants: string[]}>()
  for (const {fields, name} of named) {
    for (const item of fields) {
      const key = `${item.parent ?? ''}.${item.name}`
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, {...item, variants: [name]})
        continue
      }
      const options = [...new Set([...(existing.options ?? []), ...(item.options ?? [])])]
      merged.set(key, {
        ...existing,
        ...(options.length > 0 && {options}),
        required: Boolean(existing.required && item.required),
        variants: [...existing.variants, name],
      })
    }
  }
  return [...merged.values()]
    .map(({variants: fieldVariants, ...item}) => {
      const inEvery = fieldVariants.length === named.length
      return {
        ...item,
        required: inEvery && Boolean(item.required),
        ...(!inEvery && {variants: fieldVariants}),
      }
    })
    .map(({required, ...item}) => (required ? {...item, required} : item))
}

function successSchemas(spec: ContextOpenApiDocument, operation: SpecOperation): Schema[] {
  return Object.entries(operation.responses ?? {})
    .filter(([status]) => status.startsWith('2') && status !== '204')
    .flatMap(([, response]) => {
      const schema = response.content?.['application/json']?.schema
      return schema ? [resolve(spec, schema)] : []
    })
}

function hasProperty(schema: Schema, name: string): boolean {
  return isSchema(schema.properties) && name in schema.properties
}

/** Distill one operation of the spec */
function distillOperation(
  spec: ContextOpenApiDocument,
  path: string,
  method: string,
  pathParameters: SpecParameter[],
  operation: SpecOperation,
): ContextOperation {
  const parameters = [...pathParameters, ...(operation.parameters ?? [])]
  const pathParams = [...path.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .filter((name) => name !== 'apiVersion')
    .map((name) => {
      const description = text(
        parameters.find((p) => p.in === 'path' && p.name === name)?.description,
      )
      return {name, ...(description && {description})}
    })
  const queryFields = parameters
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) =>
      field(spec, 'query', parameter.name, parameter.schema ?? {}, {
        ...(parameter.required && {required: true}),
        ...(text(parameter.description) && {description: text(parameter.description)}),
      }),
    )
  const bodySchema = operation.requestBody?.content?.['application/json']?.schema
  const responses = successSchemas(spec, operation)
  const statuses = Object.keys(operation.responses ?? {}).filter((status) => status.startsWith('2'))

  return {
    body: bodySchema ? (operation.requestBody?.required ? 'required' : 'optional') : 'none',
    description: text(operation.description) ?? '',
    fields: [...queryFields, ...(bodySchema ? bodyFields(spec, bodySchema) : [])],
    noContent: statuses.length > 0 && statuses.every((status) => status === '204'),
    paginated:
      queryFields.some((item) => item.name === 'cursor') &&
      responses.some((schema) => hasProperty(schema, 'data') && hasProperty(schema, 'nextCursor')),
    pathParams,
    // The route type is checked where the generated module is compiled
    route: `${method.toUpperCase()} ${path.slice(PATH_PREFIX.length)}` as ContextOperation['route'],
    startsJob: responses.some((schema) => hasProperty(schema, 'jobId')),
    summary: text(operation.summary) ?? '',
  }
}

/** Names the commands give flags of their own */
const RESERVED_FLAGS = new Set(['json', 'organization', 'watch', 'yes'])

/**
 * Each field becomes a flag named after it, nested fields included, so two
 * fields with one name (under different parents) or a field named like a
 * command's own flag would collide. Generation fails instead.
 */
function assertDistinctFlags(operationId: string, operation: ContextOperation): void {
  const seen = new Set<string>()
  for (const {name} of operation.fields) {
    if (name === 'organizationId') continue
    if (seen.has(name) || RESERVED_FLAGS.has(name)) {
      throw new Error(`Field "${name}" of ${operationId} would collide with another flag`)
    }
    seen.add(name)
  }
}

/**
 * Distill the named operations of the Context API spec into what a command
 * needs: the route, the summary and description, the path parameters, and the
 * query and body fields with their types, enums and descriptions.
 */
export function distillContextOperations(
  spec: ContextOpenApiDocument,
  operationIds: readonly string[],
): Record<string, ContextOperation> {
  const found = new Map<string, ContextOperation>()
  for (const [path, item] of Object.entries(spec.paths)) {
    if (!path.startsWith(PATH_PREFIX)) continue
    const pathParameters = Array.isArray(item.parameters) ? item.parameters : []
    for (const method of METHODS) {
      const operation = item[method]
      if (!isOperation(operation) || !operation.operationId) continue
      if (!operationIds.includes(operation.operationId)) continue
      found.set(
        operation.operationId,
        distillOperation(spec, path, method, pathParameters, operation),
      )
    }
  }

  for (const [operationId, operation] of found) assertDistinctFlags(operationId, operation)

  const missing = operationIds.filter((id) => !found.has(id))
  if (missing.length > 0) {
    throw new Error(`Operations missing from the Context API spec: ${missing.join(', ')}`)
  }
  return Object.fromEntries(operationIds.map((id) => [id, found.get(id)!]))
}
