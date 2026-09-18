import {type SchemaValidationProblemGroup} from '@sanity/types'

export class SchemaExtractionError extends Error {
  validation?: SchemaValidationProblemGroup[]

  constructor(
    message: string,
    validation?: SchemaValidationProblemGroup[],
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SchemaExtractionError'
    this.validation = validation
  }
}
