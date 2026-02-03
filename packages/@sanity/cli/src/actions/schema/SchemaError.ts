import {type Schema} from '@sanity/types'

// TODO: Maybe use this from Sanity?
export class SchemaError extends Error {
  public schema: Schema

  constructor(schema: Schema) {
    super('SchemaError')
    this.schema = schema
    this.name = 'SchemaError'
  }
}
