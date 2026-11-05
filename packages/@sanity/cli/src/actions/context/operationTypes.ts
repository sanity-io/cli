import {type Context} from '@sanity/client'

/**
 * How a field's flag parses its value. `json` takes a JSON value, for fields
 * the spec types as arrays of objects or free-form objects.
 */
export type OperationFieldType = 'boolean' | 'integer' | 'json' | 'number' | 'string' | 'string[]'

export interface OperationField {
  readonly in: 'body' | 'query'
  /** The wire name, such as `includePaths` */
  readonly name: string
  readonly type: OperationFieldType

  readonly description?: string
  /** Whether the field takes `null`, to clear it */
  readonly nullable?: boolean
  /** The enum's values */
  readonly options?: readonly string[]
  /** The object field the field nests in, such as `crawlOptions` */
  readonly parent?: string
  readonly required?: boolean
  /** The body variants (values of the discriminating `type`) the field belongs to */
  readonly variants?: readonly string[]
}

interface OperationPathParam {
  readonly name: string

  readonly description?: string
}

/** A Context API operation, distilled from the spec for building a command */
export interface ContextOperation {
  readonly body: 'none' | 'optional' | 'required'
  readonly description: string
  readonly fields: readonly OperationField[]
  /** The response has no body (`204 No Content`) */
  readonly noContent: boolean
  /** The response is a page (`data` and `nextCursor`) and the query takes a `cursor` */
  readonly paginated: boolean
  readonly pathParams: readonly OperationPathParam[]
  readonly route: Context.Route
  /** The response carries the `jobId` of the job it starts */
  readonly startsJob: boolean
  readonly summary: string
}
