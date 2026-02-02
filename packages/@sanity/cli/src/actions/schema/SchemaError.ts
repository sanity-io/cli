import {type Schema} from '@sanity/types'

export class SchemaError extends Error {
  public schema: Schema

  constructor(schema: Schema) {
    super('SchemaError')
    this.schema = schema
    this.name = 'SchemaError'
  }
}
