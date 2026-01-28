import {type Output} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {generateHelpUrl} from '@sanity/generate-help-url'
import {type SchemaValidationProblemGroup} from '@sanity/types'
import {upperFirst} from 'lodash-es'

const consoleOutputter = {error: (...args: unknown[]) => console.error(...args)}

export class SchemaError extends Error {
  problemGroups: SchemaValidationProblemGroup[]

  constructor(problemGroups: SchemaValidationProblemGroup[]) {
    super('Schema errors encountered')
    this.name = 'SchemaError'
    this.problemGroups = problemGroups
  }

  print(output: Output): void {
    const logger = output || consoleOutputter
    logger.error('Uh oh… found errors in schema:\n')

    for (const group of this.problemGroups) {
      for (const problem of group.problems) {
        const icon = logSymbols[problem.severity] || logSymbols.info

        let message = `${icon} ${upperFirst(problem.severity)}: ${getPath(group.path)}\n${problem.message}`
        if (problem.helpId) {
          message += `\nSee ${generateHelpUrl(problem.helpId)}`
        }

        output.error(message, {exit: 1})
      }
    }
  }
}

function getPath(path: SchemaValidationProblemGroup['path']) {
  return path
    .map((segment) => {
      if (segment.kind === 'type' && segment.name && segment.type) {
        return `${segment.name} - (${segment.type})`
      }
      if (segment.kind === 'property' && segment.name) {
        return segment.name
      }
      return null
    })
    .filter(Boolean)
    .join(' / ')
}
