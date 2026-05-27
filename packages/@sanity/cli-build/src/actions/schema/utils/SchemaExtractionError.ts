import {type SchemaValidationProblemGroup} from '@sanity/types'

export class SchemaExtractionError extends Error {
  validation?: SchemaValidationProblemGroup[]

  constructor(message: string, validation?: SchemaValidationProblemGroup[]) {
    super(message)
    this.name = 'SchemaExtractionError'
    this.validation = validation
  }
}
