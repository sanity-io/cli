import {formatSchemaValidation} from '@sanity/cli-build/_internal/extract'
import {type Output} from '@sanity/cli-core'
import {type SchemaValidationProblemGroup} from '@sanity/types'

export class SchemaError extends Error {
  problemGroups: SchemaValidationProblemGroup[]

  constructor(problemGroups: SchemaValidationProblemGroup[]) {
    super('Schema errors encountered')
    this.name = 'SchemaError'
    this.problemGroups = problemGroups
  }

  print(output: Output, label?: string): void {
    output.warn(`${label ?? 'Found errors in schema'}:\n`)
    output.log(formatSchemaValidation(this.problemGroups))
  }
}
