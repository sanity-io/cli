import {type Output} from '@sanity/cli-core'
import {type SchemaValidationProblemGroup} from '@sanity/types'

import {formatSchemaValidation} from '../schema/formatSchemaValidation.js'

export class SchemaError extends Error {
  problemGroups: SchemaValidationProblemGroup[]

  constructor(problemGroups: SchemaValidationProblemGroup[]) {
    super('Schema errors encountered')
    this.name = 'SchemaError'
    this.problemGroups = problemGroups
  }

  print(output: Output): void {
    output.warn('Found errors in schema:\n')
    output.log(formatSchemaValidation(this.problemGroups))
  }
}
